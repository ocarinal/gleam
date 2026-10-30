//! QQ 音乐歌词源 (公开 web 接口)

use std::time::Duration;

use crate::lyrics::{duration_ok, norm, Candidate};

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

fn parse_body(body: &str) -> Option<serde_json::Value> {
    let s = body.trim();
    if s.starts_with('{') {
        return serde_json::from_str(s).ok();
    }
    // JSONP: MusicJsonCallback({...})
    let start = s.find('(')?;
    let end = s.rfind(')')?;
    serde_json::from_str(&s[start + 1..end]).ok()
}

fn get_json(url: &str) -> Option<serde_json::Value> {
    let resp = crate::http::get(url)
        .set("User-Agent", "Mozilla/5.0")
        .set("Referer", "https://y.qq.com/")
        .timeout(Duration::from_secs(5))
        .call()
        .ok()?;
    let body = resp.into_string().ok()?;
    parse_body(&body)
}

fn seconds_of(v: &serde_json::Value) -> Option<f64> {
    v.as_f64()
        .or_else(|| v.as_u64().map(|x| x as f64))
        .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
}

pub fn candidate(title: &str, artist: &str, length_ms: Option<u64>) -> Option<Candidate> {
    let q = format!("{title} {artist}");
    let url = format!(
        "https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w={}&format=json&n=8&p=1&cr=1&new_json=1",
        enc(&q)
    );
    let v = get_json(&url)?;
    let list = v.get("data")?.get("song")?.get("list")?.as_array()?;

    let target = length_ms.map(|ms| ms as f64 / 1000.0);
    let mut best: Option<(f64, String, String, String)> = None;
    for s in list {
        let Some(name) = s.get("name").and_then(|x| x.as_str()) else {
            continue;
        };
        let singers = s
            .get("singer")
            .and_then(|x| x.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.get("name").and_then(|n| n.as_str()))
                    .collect::<Vec<_>>()
                    .join(" / ")
            })
            .unwrap_or_default();
        let interval = s.get("interval").and_then(seconds_of);
        if target.is_some() {
            // QQ 搜索偶尔缺 interval，宁缺毋滥
            if interval.is_none() {
                continue;
            }
            if !duration_ok(interval, length_ms, 8.0) {
                continue;
            }
        }
        // 防止搜到同名但完全不同的版本
        if length_ms.is_none() && norm(name) != norm(title) {
            continue;
        }
        let mut score = 0.0;
        if norm(name) == norm(title) {
            score += 50.0;
        } else if norm(name).contains(&norm(title)) {
            score += 15.0;
        } else {
            score -= 30.0;
        }
        if !artist.trim().is_empty() && norm(&singers).contains(&norm(artist)) {
            score += 30.0;
        }
        if let (Some(d), Some(t)) = (interval, target) {
            score += 20.0 - (d - t).abs().min(20.0);
        }
        if let Some(mid) = s.get("mid").and_then(|x| x.as_str()) {
            let entry = (score, mid.to_string(), name.to_string(), singers);
            if best.as_ref().map(|b| entry.0 > b.0).unwrap_or(true) {
                best = Some(entry);
            }
        }
    }
    let (score, mid, name, singers) = best?;
    if score <= 0.0 {
        return None;
    }

    let url = format!(
        "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid={}&format=json&nobase64=1",
        enc(&mid)
    );
    let v = get_json(&url)?;
    let lrc = v.get("lyric").and_then(|x| x.as_str())?.trim().to_string();
    if lrc.is_empty() {
        return None;
    }
    let tlyric = v
        .get("trans")
        .and_then(|x| x.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let source = if singers.trim().is_empty() {
        format!("QQ音乐 · {}", name)
    } else {
        format!("QQ音乐 · {} — {}", singers, name)
    };
    Some(Candidate {
        source,
        synced: crate::lyrics::has_timestamps(&lrc),
        word_timed: crate::lyrics::has_word_tags(&lrc),
        lrc,
        tlyric,
    })
}
