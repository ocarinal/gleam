//! 网易云音乐歌词来源 (公开 api, 与 LRCLIB 互补)
//! 注意: 非官方接口, 作为歌词源之一; 失败时回退 LRCLIB

use serde::{Deserialize, Serialize};
use std::time::Duration;

const NETEASE_API: &str = "https://music.163.com/api";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NeteaseSong {
    pub id: u64,
    pub name: String,
    pub duration: Option<u64>,
    #[serde(default)]
    pub artists: Vec<NeteaseArtist>,
    #[serde(default)]
    pub album: NeteaseAlbum,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NeteaseArtist {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NeteaseAlbum {
    pub name: Option<String>,
    pub pic_url: Option<String>,
}

fn get_json(url: &str) -> Result<serde_json::Value, String> {
    ureq::get(url)
        .set("User-Agent", "Mozilla/5.0")
        .set("Referer", "https://music.163.com")
        .timeout(Duration::from_secs(8))
        .call()
        .map_err(|e| format!("网易云请求失败: {e}"))?
        .into_json()
        .map_err(|e| format!("网易云解析失败: {e}"))
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

/// 归一化: 小写 + 去所有非字母数字 (应对 "(Movie Edit)" vs "(movie edit.)" 这类差异)
fn norm(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

/// 搜索并挑选 (标题+歌手+时长 打分, 与 LRCLIB 同策略)
pub fn search(
    title: &str,
    artist: &str,
    length_ms: Option<u64>,
) -> Result<Vec<NeteaseSong>, String> {
    let q = format!("{title} {artist}");
    let url = format!(
        "{NETEASE_API}/search/get/web?s={}&type=1&limit=10&offset=0",
        enc(&q)
    );
    let v = get_json(&url)?;
    let songs = v
        .get("result")
        .and_then(|r| r.get("songs"))
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let mut out: Vec<NeteaseSong> = serde_json::from_value(songs).unwrap_or_default();

    let target = length_ms.map(|ms| ms as f64 / 1000.0);
    let score = |s: &NeteaseSong| -> f64 {
        let mut sc = 0.0;
        if norm(&s.name) == norm(title) {
            sc += 50.0;
        } else if s.name != title {
            sc -= 20.0;
        }
        let arts = s.artists.iter().map(|a| a.name.clone()).collect::<Vec<_>>().join(" / ");
        if norm(&arts).contains(&norm(artist)) || norm(artist).contains(&norm(&arts)) {
            sc += 20.0;
        }
        if let (Some(d), Some(t)) = (s.duration, target) {
            let diff = (d as f64 / 1000.0 - t).abs();
            sc -= if diff < 5.0 { diff } else { 60.0 };
        }
        sc
    };
    out.sort_by(|a, b| {
        score(b)
            .partial_cmp(&score(a))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(out)
}

/// 专辑封面 URL (song/detail 可靠返回 picUrl, 搜索结果里常为空)
pub fn album_cover_url(song_id: u64) -> Result<String, String> {
    let url = format!("{NETEASE_API}/song/detail?ids=%5B{song_id}%5D");
    let v = get_json(&url)?;
    v.get("songs")
        .and_then(|s| s.get(0))
        .and_then(|s| s.get("album"))
        .and_then(|a| a.get("picUrl"))
        .and_then(|p| p.as_str())
        .map(|s| s.to_string())
        .filter(|s| s.starts_with("http"))
        .ok_or_else(|| "网易云无封面".to_string())
}

/// 歌词结果: LRC + 可选翻译 (tlyric)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NeteaseLyrics {
    pub lrc: String,
    pub tlyric: Option<String>,
}

/// 获取同步歌词 (LRC) + 翻译
pub fn fetch_lyrics(song_id: u64) -> Result<NeteaseLyrics, String> {
    let url = format!(
        "{NETEASE_API}/song/lyric?id={song_id}&lv=1&kv=1&tv=-1"
    );
    let v = get_json(&url)?;
    let lrc = v
        .get("lrc")
        .and_then(|l| l.get("lyric"))
        .and_then(|l| l.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "网易云无歌词".to_string())?;
    let tlyric = v
        .get("tlyric")
        .and_then(|t| t.get("lyric"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.trim().is_empty());
    Ok(NeteaseLyrics { lrc, tlyric })
}
