//! 多源歌词聚合: 双语逐字 > 双语 > 单语逐字 > 单语；同步歌词优先。
//!
//! 各源返回统一的 `Candidate`，由这里并行收集并按优先级挑选。
//! "逐字" 只认真正的逐词/逐字时间标签（增强 LRC `<mm:ss.xx>`、KRC 等）；
//! 普通 LRC 的逐字效果由前端按行时长插值，不算精确逐字。

use std::sync::mpsc;
use std::time::{Duration, Instant};

#[derive(Clone, Debug, Default)]
pub struct Candidate {
    pub source: String,
    pub lrc: String,
    pub tlyric: Option<String>,
    pub synced: bool,
    pub word_timed: bool,
}

impl Candidate {
    /// 有真正的翻译行（排除只有 [by:...] 这类元数据）
    pub fn bilingual(&self) -> bool {
        self.tlyric
            .as_deref()
            .map(|t| {
                t.lines().any(|l| {
                    let l = l.trim();
                    if !l.starts_with('[') {
                        return false;
                    }
                    let Some(end) = l.find(']') else {
                        return false;
                    };
                    is_time_tag(&l[1..end]) && !l[end + 1..].trim().is_empty()
                })
            })
            .unwrap_or(false)
    }

    /// 分数: 同步 100 + 双语 20 + 逐字 10；未同步最高只有 20。
    /// 即 双语逐字 130 > 双语 120 > 单语逐字 110 > 单语 100。
    pub fn rank(&self) -> (i32, u8) {
        let mut score = if self.synced { 100 } else { 0 };
        if self.bilingual() {
            score += 20;
        }
        if self.word_timed {
            score += 10;
        }
        (score, source_priority(&self.source))
    }

    /// 给界面显示的来源加质量标记
    pub fn with_quality_label(mut self) -> Self {
        let q = match (self.bilingual(), self.word_timed) {
            (true, true) => "双语逐字",
            (true, false) => "双语",
            (false, true) => "逐字",
            (false, false) => return self,
        };
        self.source = format!("{} · {}", self.source, q);
        self
    }
}

fn source_priority(source: &str) -> u8 {
    if source.starts_with("LRCLIB") {
        4
    } else if source.starts_with("网易云") {
        3
    } else if source.starts_with("QQ") {
        2
    } else if source.starts_with("酷狗") {
        1
    } else {
        0
    }
}

/// `[mm:ss.xx]` / `[mm:ss.xxx]` 的括号内容是否为时间
pub fn is_time_tag(tag: &str) -> bool {
    let mut parts = tag.split(':');
    let Some(m) = parts.next() else { return false };
    let Some(s) = parts.next() else { return false };
    !m.is_empty()
        && m.chars().all(|c| c.is_ascii_digit())
        && s.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false)
        && s.parse::<f64>().is_ok()
}

/// 是否包含行时间戳（排除 [ti:]、[ar:] 等元数据）
pub fn has_timestamps(s: &str) -> bool {
    s.lines().any(|l| {
        let l = l.trim_start();
        if !l.starts_with('[') {
            return false;
        }
        let Some(end) = l.find(']') else { return false };
        is_time_tag(&l[1..end])
    })
}

/// 是否包含增强 LRC 的逐词标签 `<mm:ss.xx>`
pub fn has_word_tags(s: &str) -> bool {
    let mut rest = s;
    while let Some(i) = rest.find('<') {
        let after = &rest[i + 1..];
        let Some(j) = after.find('>') else { return false };
        if is_time_tag(&after[..j]) {
            return true;
        }
        rest = &after[j + 1..];
    }
    false
}

/// 归一化: 小写 + 只保留字母数字
pub fn norm(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

/// 时长是否在容差内（秒）；没有目标时长时视为通过
pub fn duration_ok(seconds: Option<f64>, length_ms: Option<u64>, tol: f64) -> bool {
    match (seconds, length_ms) {
        (Some(d), Some(ms)) => (d - ms as f64 / 1000.0).abs() <= tol,
        _ => true,
    }
}

/// 并行查询所有源，按优先级返回最佳候选。
/// 12 秒硬截止；一旦出现"双语逐字"立即返回。
pub fn collect(
    title: &str,
    artist: &str,
    length_ms: Option<u64>,
    recording_id: Option<&str>,
) -> Option<Candidate> {
    let (tx, rx) = mpsc::channel::<Option<Candidate>>();

    let t = title.to_string();
    let a = artist.to_string();
    let rid = recording_id.map(|s| s.to_string());
    let tx1 = tx.clone();
    std::thread::spawn(move || {
        let _ = tx1.send(crate::lrclib::candidate(&t, &a, length_ms, rid.as_deref()));
    });

    let t = title.to_string();
    let a = artist.to_string();
    let tx2 = tx.clone();
    std::thread::spawn(move || {
        let _ = tx2.send(crate::netease::candidate(&t, &a, length_ms));
    });

    let t = title.to_string();
    let a = artist.to_string();
    let tx3 = tx.clone();
    std::thread::spawn(move || {
        let _ = tx3.send(crate::qq::candidate(&t, &a, length_ms));
    });

    let t = title.to_string();
    let a = artist.to_string();
    let tx4 = tx.clone();
    std::thread::spawn(move || {
        let _ = tx4.send(crate::kugou::candidate(&t, &a, length_ms));
    });

    drop(tx);

    let deadline = Instant::now() + Duration::from_secs(12);
    let mut best: Option<Candidate> = None;
    let mut responded = 0usize;
    loop {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            break;
        }
        match rx.recv_timeout(left) {
            Ok(Some(c)) => {
                responded += 1;
                if c.lrc.trim().is_empty() {
                    if responded >= 4 {
                        break;
                    }
                    continue;
                }
                let better = best
                    .as_ref()
                    .map(|b| c.rank() > b.rank())
                    .unwrap_or(true);
                if better {
                    best = Some(c.clone());
                }
                if c.rank().0 >= 130 {
                    break; // 双语逐字，最高优先级，不再等其它源
                }
                // 已经有双语结果且至少两个源响应，不必再等慢源
                if responded >= 2 && best.as_ref().map(|b| b.rank().0 >= 120).unwrap_or(false) {
                    break;
                }
                if responded >= 4 {
                    break;
                }
            }
            Ok(None) => {
                responded += 1;
                if responded >= 4 {
                    break;
                }
            }
            Err(_) => break,
        }
    }

    best.map(|c| c.with_quality_label())
}

/// 指定来源获取歌词 (auto 以外的源不被其它源覆盖)
pub fn collect_one(
    source: &str,
    title: &str,
    artist: &str,
    length_ms: Option<u64>,
    recording_id: Option<&str>,
) -> Option<Candidate> {
    let c = match source {
        "lrclib" => crate::lrclib::candidate(title, artist, length_ms, recording_id),
        "netease" => crate::netease::candidate(title, artist, length_ms),
        "qq" => crate::qq::candidate(title, artist, length_ms),
        "kugou" => crate::kugou::candidate(title, artist, length_ms),
        _ => None,
    }?;
    if c.lrc.trim().is_empty() {
        return None;
    }
    Some(c.with_quality_label())
}

/// 空结果时的来源文案
pub fn source_label(source: Option<&str>) -> &'static str {
    match source.unwrap_or("auto") {
        "lrclib" => "LRCLIB",
        "netease" => "网易云音乐",
        "qq" => "QQ 音乐",
        "kugou" => "酷狗音乐",
        _ => "所有歌词源",
    }
}
