//! LRCLIB 同步歌词

use serde::{Deserialize, Serialize};
use std::time::Duration;

const LRC_API: &str = "https://lrclib.net/api";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LrcResult {
    pub track_name: String,
    pub artist_name: Option<String>,
    pub album_name: Option<String>,
    pub duration: Option<f64>,
    pub instrumental: Option<bool>,
    pub plain_lyrics: Option<String>,
    pub synced_lyrics: Option<String>,
    pub musicbrainz_recording_id: Option<String>,
}

fn enc(s: &str) -> String {
    let mut out = String::new();
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// 搜索歌词 (注意: 不传 album_name, LRCLIB 专辑过滤过严)
pub fn search(title: &str, artist: &str, length_ms: Option<u64>) -> Result<Vec<LrcResult>, String> {
    let mut url = format!("{LRC_API}/search?track_name={}&artist_name={}", enc(title), enc(artist));
    if let Some(ms) = length_ms {
        url.push_str(&format!("&duration={}", (ms as f64 / 1000.0).round() as u64));
    }
    let resp = ureq::get(&url)
        .set("User-Agent", crate::USER_AGENT)
        .timeout(Duration::from_secs(8))
        .call()
        .map_err(|e| format!("LRCLIB 请求失败: {e}"))?;
    let v: serde_json::Value = resp.into_json().map_err(|e| format!("JSON 解析失败: {e}"))?;
    Ok(serde_json::from_value(v).unwrap_or_default())
}

fn norm(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

/// 打分挑选最佳匹配 (与原型相同策略)
pub fn pick(
    results: &[LrcResult],
    title: &str,
    artist: &str,
    length_ms: Option<u64>,
    recording_id: Option<&str>,
) -> Option<LrcResult> {
    let target = length_ms.map(|ms| ms as f64 / 1000.0);
    let score = |r: &LrcResult| -> f64 {
        let mut s = 0.0;
        if let Some(rid) = recording_id {
            if r.musicbrainz_recording_id.as_deref() == Some(rid) {
                s += 100.0;
            }
        }
        if norm(&r.track_name) == norm(title) {
            s += 50.0;
        } else if r.track_name != title {
            s -= 15.0;
        }
        match r.artist_name.as_deref() {
            Some(a) if norm(a) == norm(artist) => s += 20.0,
            Some(_) => s -= 20.0,
            None => {}
        }
        if let (Some(d), Some(t)) = (r.duration, target) {
            let diff = (d - t).abs();
            s -= if diff < 10.0 { diff } else { 50.0 };
        }
        if r.synced_lyrics.is_some() {
            s += 15.0;
        }
        if r.instrumental.unwrap_or(false) {
            s -= 60.0;
        }
        s
    };
    results.iter().max_by(|a, b| {
        score(a)
            .partial_cmp(&score(b))
            .unwrap_or(std::cmp::Ordering::Equal)
    }).cloned()
}
