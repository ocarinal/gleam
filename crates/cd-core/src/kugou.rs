//! 酷狗音乐歌词源: KRC 逐字 + 内嵌翻译；失败回退 LRC。
//!
//! KRC = base64("krc1" + XOR(key) + zlib)；
//! 解压后行格式 `[lineStartMs,lineDurationMs]<offset,duration,0>word...`，
//! `[language:base64]` 里带 type=1 的逐行翻译。

use std::io::Read;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine};
use flate2::read::ZlibDecoder;
use serde_json::Value;

use crate::lyrics::{duration_ok, norm, Candidate};

const KRC_KEY: [u8; 16] = [
    64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105,
];

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

fn get_json(url: &str) -> Option<Value> {
    crate::http::get(url)
        .set("User-Agent", "Mozilla/5.0")
        .timeout(Duration::from_secs(5))
        .call()
        .ok()?
        .into_json()
        .ok()
}

fn seconds_of(v: &Value) -> Option<f64> {
    v.as_f64()
        .or_else(|| v.as_u64().map(|x| x as f64))
        .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
}

/// mm:ss.mmm
fn fmt_ts(ms: i64) -> String {
    let ms = ms.max(0);
    let m = ms / 60_000;
    let rem = ms % 60_000;
    let s = rem / 1000;
    let milli = rem % 1000;
    format!("{m:02}:{s:02}.{milli:03}")
}

/// 解出 KRC 的 `[language:...]`，返回每行翻译（与 timed lines 对齐）
fn parse_language(b64: &str) -> Vec<String> {
    let cleaned: String = b64.chars().filter(|c| !c.is_whitespace()).collect();
    let Ok(bytes) = STANDARD.decode(cleaned) else {
        return Vec::new();
    };
    let Ok(v) = serde_json::from_slice::<Value>(&bytes) else {
        return Vec::new();
    };
    let Some(items) = v.get("content").and_then(|c| c.as_array()) else {
        return Vec::new();
    };
    let tr = items.iter().find(|it| {
        it.get("type")
            .and_then(|t| t.as_i64().or_else(|| t.as_str().and_then(|s| s.parse().ok())))
            == Some(1)
    });
    let Some(lines) = tr
        .and_then(|it| it.get("lyricContent"))
        .and_then(|lc| lc.as_array())
    else {
        return Vec::new();
    };
    lines
        .iter()
        .map(|line| {
            line.as_array()
                .map(|parts| {
                    parts
                        .iter()
                        .filter_map(|p| p.as_str())
                        .collect::<Vec<_>>()
                        .join("")
                })
                .unwrap_or_default()
        })
        .collect()
}

/// 解析 `<offset,duration,0>text`，返回 (整行文本, [(绝对时间ms, 词)])
fn parse_words(body: &str, line_start: i64) -> (String, Vec<(i64, String)>) {
    let mut words = Vec::new();
    let mut text = String::new();
    let mut rest = body;
    while let Some(lt) = rest.find('<') {
        if lt > 0 {
            text.push_str(&rest[..lt]);
        }
        let after = &rest[lt + 1..];
        let Some(gt) = after.find('>') else {
            text.push_str(&rest[lt..]);
            break;
        };
        let tag = &after[..gt];
        // rest[lt] == '<', after[gt] == '>'，因此文本从 lt + gt + 2 开始
        let text_start = lt + gt + 2;
        let next = rest[text_start..]
            .find('<')
            .map(|i| text_start + i)
            .unwrap_or(rest.len());
        let word = &rest[text_start..next];
        let offset = tag
            .split(',')
            .next()
            .and_then(|x| x.trim().parse::<i64>().ok());
        if let Some(off) = offset {
            words.push((line_start + off, word.to_string()));
            text.push_str(word);
        } else {
            text.push_str(word);
        }
        rest = &rest[next..];
    }
    if !rest.is_empty() {
        text.push_str(rest);
    }
    (text, words)
}

/// 把解密后的 KRC 文本转成增强 LRC + 翻译 LRC
fn parse_krc(text: &str) -> Option<(String, Option<String>, bool)> {
    let mut translations: Vec<String> = Vec::new();
    let mut lines: Vec<(i64, String, Vec<(i64, String)>)> = Vec::new();

    for raw in text.lines() {
        let line = raw.trim_end_matches('\r');
        if let Some(rest) = line.strip_prefix("[language:") {
            if let Some(b64) = rest.strip_suffix(']') {
                translations = parse_language(b64);
            }
            continue;
        }
        if line.starts_with("[bg:") {
            continue;
        }
        let Some(rest) = line.strip_prefix('[') else {
            continue;
        };
        let Some(close) = rest.find(']') else {
            continue;
        };
        let tag = &rest[..close];
        let mut parts = tag.split(',');
        let Some(start) = parts.next().and_then(|x| x.trim().parse::<i64>().ok()) else {
            continue;
        };
        let body = &rest[close + 1..];
        let (txt, words) = parse_words(body, start);
        if txt.trim().is_empty() && words.is_empty() {
            continue;
        }
        lines.push((start, txt, words));
    }

    if lines.is_empty() {
        return None;
    }

    let mut lrc = String::new();
    for (start, txt, words) in &lines {
        lrc.push_str(&format!("[{}]", fmt_ts(*start)));
        if words.is_empty() {
            lrc.push_str(txt);
        } else {
            for (t, w) in words {
                if w.is_empty() {
                    continue;
                }
                lrc.push_str(&format!("<{}>{}", fmt_ts(*t), w));
            }
        }
        lrc.push('\n');
    }

    let mut tr = String::new();
    for (i, (start, _, _)) in lines.iter().enumerate() {
        if let Some(t) = translations
            .get(i)
            .map(|s| s.trim())
            .filter(|s| {
                !s.is_empty()
                    && !s.contains("腾讯享有")
                    && !s.contains("翻译作品")
                    && !s.contains("著作权")
            })
        {
            tr.push_str(&format!("[{}]{}\n", fmt_ts(*start), t));
        }
    }
    let tlyric = if tr.trim().is_empty() { None } else { Some(tr) };
    let word_timed = lines.iter().any(|(_, _, w)| !w.is_empty());
    Some((lrc, tlyric, word_timed))
}

/// KRC 二进制 -> 增强 LRC
fn decode_krc_bytes(bytes: &[u8]) -> Option<(String, Option<String>, bool)> {
    if bytes.len() < 4 || &bytes[..4] != b"krc1" {
        return None;
    }
    let dec: Vec<u8> = bytes[4..]
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ KRC_KEY[i % KRC_KEY.len()])
        .collect();
    let mut z = ZlibDecoder::new(&dec[..]);
    let mut text = String::new();
    z.read_to_string(&mut text).ok()?;
    parse_krc(&text)
}

/// 下载歌词内容并 base64 解码（LRC 文本或 KRC 二进制）
fn download_bytes(id: &str, key: &str, fmt: &str) -> Option<Vec<u8>> {
    let url = format!(
        "https://lyrics.kugou.com/download?ver=1&client=pc&id={}&accesskey={}&fmt={}&charset=utf8",
        enc(id),
        enc(key),
        enc(fmt)
    );
    let v = get_json(&url)?;
    let content = v.get("content")?.as_str()?;
    if content.trim().is_empty() {
        return None;
    }
    let cleaned: String = content.chars().filter(|c| !c.is_whitespace()).collect();
    STANDARD.decode(cleaned).ok()
}

pub fn candidate(title: &str, artist: &str, length_ms: Option<u64>) -> Option<Candidate> {
    let q = format!("{title} {artist}");
    let target = length_ms.map(|ms| ms as f64 / 1000.0);

    let search_url = format!(
        "https://songsearch.kugou.com/song_search_v2?keyword={}&page=1&pagesize=8&platform=WebFilter&userid=-1&clientver=2000&iscorrection=1&privilege_filter=0&filter=10&appid=1014&signature=",
        enc(&q)
    );
    let sv = get_json(&search_url)?;
    let lists = sv.get("data")?.get("lists")?.as_array()?;

    let mut best_song: Option<(f64, String, String, String, Option<f64>)> = None;
    for s in lists {
        let Some(name) = s.get("SongName").and_then(|x| x.as_str()) else {
            continue;
        };
        let singer = s
            .get("SingerName")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let dur = s.get("Duration").and_then(seconds_of);
        if target.is_some() {
            if dur.is_none() || !duration_ok(dur, length_ms, 8.0) {
                continue;
            }
        }
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
        if !artist.trim().is_empty() && norm(&singer).contains(&norm(artist)) {
            score += 30.0;
        }
        if let (Some(d), Some(t)) = (dur, target) {
            score += 20.0 - (d - t).abs().min(20.0);
        }
        let Some(hash) = s.get("FileHash").and_then(|x| x.as_str()) else {
            continue;
        };
        let entry = (score, hash.to_string(), name.to_string(), singer, dur);
        if best_song.as_ref().map(|b| entry.0 > b.0).unwrap_or(true) {
            best_song = Some(entry);
        }
    }
    let (score, hash, name, singer, dur) = best_song?;
    if score <= 0.0 {
        return None;
    }

    let dur_secs = length_ms
        .map(|ms| (ms as f64 / 1000.0).round() as u64)
        .or_else(|| dur.map(|d| d.round() as u64))
        .unwrap_or(0);
    let lyric_search = format!(
        "https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword={}&duration={}&hash={}",
        enc(&q),
        dur_secs,
        enc(&hash)
    );
    let lv = get_json(&lyric_search)?;
    let candidates = lv.get("candidates")?.as_array()?;
    let target_ms = length_ms.map(|ms| ms as f64).or_else(|| dur.map(|d| d * 1000.0));

    let mut best_lyric: Option<(f64, String, String)> = None;
    for c in candidates {
        let Some(id) = c.get("id").and_then(|x| x.as_str()) else {
            continue;
        };
        let Some(key) = c.get("accesskey").and_then(|x| x.as_str()) else {
            continue;
        };
        let cdur = c.get("duration").and_then(seconds_of); // ms
        if let (Some(t), Some(d)) = (target_ms, cdur) {
            if (d - t).abs() > 6000.0 {
                continue;
            }
        }
        let from = c.get("product_from").and_then(|x| x.as_str()).unwrap_or("");
        let mut score = 0.0;
        if let (Some(t), Some(d)) = (target_ms, cdur) {
            score += 1000.0 - (d - t).abs();
        }
        if from.contains("官方") {
            score += 500.0;
        }
        let entry = (score, id.to_string(), key.to_string());
        if best_lyric.as_ref().map(|b| entry.0 > b.0).unwrap_or(true) {
            best_lyric = Some(entry);
        }
    }

    let (_, id, key) = best_lyric?;
    let lrc = download_bytes(&id, &key, "krc").and_then(|b| decode_krc_bytes(&b));

    if let Some((lrc, tlyric, word_timed)) = lrc {
        let source = if singer.trim().is_empty() {
            format!("酷狗音乐 · {}", name)
        } else {
            format!("酷狗音乐 · {} — {}", singer, name)
        };
        return Some(Candidate {
            source,
            synced: crate::lyrics::has_timestamps(&lrc),
            word_timed,
            lrc,
            tlyric,
        });
    }

    // KRC 不可用时回退普通 LRC
    let lrc = String::from_utf8(download_bytes(&id, &key, "lrc")?).ok()?;
    if lrc.trim().is_empty() {
        return None;
    }
    let source = if singer.trim().is_empty() {
        format!("酷狗音乐 · {}", name)
    } else {
        format!("酷狗音乐 · {} — {}", singer, name)
    };
    Some(Candidate {
        source,
        synced: crate::lyrics::has_timestamps(&lrc),
        word_timed: crate::lyrics::has_word_tags(&lrc),
        lrc,
        tlyric: None,
    })
}
