//! MusicBrainz DiscID 计算 — 算法与 MusicBrainz 官方文档一致
//! (SHA-1 十六进制 TOC 描述 + 自定义 Base64, +/= 替换为 ._-)
//!
//! 注意: ioctl 读到的 TOC 偏移是裸 LBA (首轨=0);
//! DiscID 算法要求「帧偏移」= LBA + 150, 本模块统一在此转换。

use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};

pub const CDROM_DATA_TRACK: u8 = 0x04;
const LEADIN: u32 = 150; // 每轨 LBA 偏移 +150
const MULTISESSION_GAP: u32 = 11400; // CD-Extra 数据轨前的间隙(帧)

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Toc {
    pub first: u8,
    pub last: u8,
    /// (裸 LBA, control) 每轨
    pub tracks: Vec<(u32, u8)>,
    pub leadout: u32, // 裸 LBA
}

impl Toc {
    pub fn audio_offsets(&self) -> Vec<u32> {
        self.tracks
            .iter()
            .filter(|(_, c)| c & CDROM_DATA_TRACK == 0)
            .map(|(off, _)| *off)
            .collect()
    }

    /// lead-out 帧偏移 (CD-Extra 时用数据轨偏移扣减)
    pub fn leadout_frame(&self) -> u32 {
        match self.tracks.iter().find(|(_, c)| c & CDROM_DATA_TRACK != 0) {
            Some((off, _)) => off + LEADIN - MULTISESSION_GAP,
            None => self.leadout + LEADIN,
        }
    }

    /// freedb TOC 字符串: "first last f1 f2 ... fN leadout" (帧偏移), 供 MusicBrainz 网页提交
    pub fn toc_string(&self) -> String {
        let mut v: Vec<u32> = self.audio_offsets().iter().map(|l| l + LEADIN).collect();
        v.push(self.leadout_frame());
        let mut s = format!("{} {} ", self.first, self.last);
        for x in v {
            s.push_str(&x.to_string());
            s.push(' ');
        }
        s.trim_end().to_string()
    }

    /// 每音轨时长 (ms); 最后一轨由 lead-out 推得
    pub fn track_durations_ms(&self) -> Vec<u64> {
        let audio = self.audio_offsets();
        let leadout = self.leadout_frame();
        let mut out = Vec::with_capacity(audio.len());
        for (i, lba) in audio.iter().enumerate() {
            let next = if i + 1 < audio.len() { audio[i + 1] + LEADIN } else { leadout };
            let dur = (next - (lba + LEADIN)) as u64 * 1000 / 75;
            out.push(dur);
        }
        out
    }
}

/// TOC -> MusicBrainz DiscID
pub fn compute_disc_id(toc: &Toc) -> Result<String, String> {
    let audio = toc.audio_offsets();
    if audio.is_empty() {
        return Err("没有音频轨".into());
    }
    let leadout = toc.leadout_frame();

    let mut s = format!("{:02X}{:02X}{:08X}", toc.first, toc.last, leadout);
    for off in &audio {
        s.push_str(&format!("{:08X}", off + LEADIN));
    }
    for _ in audio.len()..99 {
        s.push_str("00000000");
    }
    let digest = Sha1::digest(s.as_bytes());
    Ok(b64_mb(&digest))
}

/// MusicBrainz 风格 Base64 (20 字节 -> 28 字符)
fn b64_mb(data: &[u8]) -> String {
    const CHARS: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._";
    let mut out = String::new();
    for chunk in data.chunks(3) {
        let mut b = [0u8; 3];
        b[..chunk.len()].copy_from_slice(chunk);
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(CHARS[(n >> 18) as usize & 63] as char);
        out.push(CHARS[(n >> 12) as usize & 63] as char);
        if chunk.len() > 1 {
            out.push(CHARS[(n >> 6) as usize & 63] as char);
        }
        if chunk.len() > 2 {
            out.push(CHARS[n as usize & 63] as char);
        }
    }
    match data.len() % 3 {
        1 => out.push_str("--"), // 1 字节 -> 2 字符 + 2 个填充 '-'
        2 => out.push('-'),
        _ => {}
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn official_example() {
        // MusicBrainz 官方文档示例 (裸 LBA): 必须逐字节一致
        let toc = Toc {
            first: 1,
            last: 6,
            tracks: vec![
                (0, 0x02),
                (15213, 0x02),
                (32164, 0x02),
                (46442, 0x02),
                (63264, 0x02),
                (80339, 0x02),
            ],
            leadout: 95312,
        };
        assert_eq!(
            compute_disc_id(&toc).unwrap(),
            "49HHV7Eb8UKF3aQiNmu1GR8vKTY-"
        );
        assert_eq!(toc.toc_string(), "1 6 150 15363 32314 46592 63414 80489 95462");
    }

    #[test]
    fn cd_extra_leadout_correction() {
        // 官方文档 multi-session 示例: 末轨为数据轨
        let toc = Toc {
            first: 1,
            last: 8,
            tracks: vec![
                (0, 0x00),
                (13959, 0x00),
                (33436, 0x00),
                (52927, 0x00),
                (65631, 0x00),
                (77742, 0x00),
                (99024, 0x00),
                (125824, 0x06), // 数据轨
            ],
            leadout: 188333,
        };
        assert_eq!(toc.leadout_frame(), 114574); // 官方文档结论
        assert_eq!(compute_disc_id(&toc).unwrap().len(), 28);
    }
}
