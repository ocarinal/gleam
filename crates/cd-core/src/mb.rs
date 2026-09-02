//! MusicBrainz 客户端 (1 req/s 限速 + 瞬时错误重试)

use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::USER_AGENT;

const MB_API: &str = "https://musicbrainz.org/ws/2";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ArtistCredit {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RecordingRef {
    pub id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub title: String,
    pub length: Option<u64>,
    pub artist_credit: Option<Vec<ArtistCredit>>,
    pub recording: Option<RecordingRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Medium {
    pub format: Option<String>,
    pub track_count: Option<u32>,
    pub tracks: Option<Vec<Track>>,
    pub discs: Option<Vec<Disc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Disc {
    pub id: Option<String>,
    pub sectors: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseGroupRef {
    pub id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub id: String,
    pub title: String,
    pub date: Option<String>,
    pub country: Option<String>,
    pub status: Option<String>,
    pub barcode: Option<String>,
    pub disambiguation: Option<String>,
    pub artist_credit: Option<Vec<ArtistCredit>>,
    pub media: Option<Vec<Medium>>,
    pub release_group: Option<ReleaseGroupRef>,
}

fn get_json(url: &str) -> Result<serde_json::Value, String> {
    let mut last_err = String::new();
    for i in 0..3 {
        match ureq::get(url)
            .set("User-Agent", USER_AGENT)
            .set("Accept", "application/json")
            .timeout(Duration::from_secs(25))
            .call()
        {
            Ok(resp) => return resp.into_json().map_err(|e| format!("JSON 解析失败: {e}")),
            Err(ureq::Error::Status(404, _)) => return Err("not_found".into()),
            Err(ureq::Error::Status(code, _)) if (502..=504).contains(&code) => {
                last_err = format!("HTTP {code}");
                std::thread::sleep(Duration::from_secs(3 * (i as u64 + 1)));
            }
            Err(e) => {
                last_err = format!("{e}");
                if i < 2 {
                    std::thread::sleep(Duration::from_secs(2));
                    continue;
                }
            }
        }
    }
    Err(format!("MusicBrainz 请求失败: {last_err}"))
}

/// MusicBrainz 限速: <=1 req/s
fn mb_get(path: &str, params: &[(&str, &str)]) -> Result<serde_json::Value, String> {
    std::thread::sleep(Duration::from_millis(1100));
    let qs = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencode(v)))
        .collect::<Vec<_>>()
        .join("&");
    get_json(&format!("{MB_API}{path}?{qs}"))
}

fn urlencode(s: &str) -> String {
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

pub fn lookup_by_discid(discid: &str) -> Result<Vec<Release>, String> {
    let v = match mb_get(
        &format!("/discid/{}", urlencode(discid)),
        &[("inc", "recordings artist-credits"), ("fmt", "json")],
    ) {
        Ok(v) => v,
        // DiscID 不在库 = 没有候选, 不是错误
        Err(e) if e == "not_found" => return Ok(Vec::new()),
        Err(e) => return Err(e),
    };
    let releases = v.get("releases").cloned().unwrap_or(serde_json::Value::Null);
    Ok(serde_json::from_value(releases).unwrap_or_default())
}

pub fn search_releases(query: &str) -> Result<Vec<Release>, String> {
    let v = mb_get(
        "/release",
        &[("query", query), ("limit", "8"), ("fmt", "json")],
    )?;
    let releases = v.get("releases").cloned().unwrap_or(serde_json::Value::Null);
    Ok(serde_json::from_value(releases).unwrap_or_default())
}

pub fn get_release(id: &str) -> Result<Release, String> {
    let v = mb_get(
        &format!("/release/{id}"),
        &[
            ("inc", "media recordings artist-credits"),
            ("fmt", "json"),
        ],
    )?;
    serde_json::from_value(v).map_err(|e| format!("解析失败: {e}"))
}

/// 按 状态/格式/国别/轨数 打分选最优
pub fn pick_release(releases: &[Release], expect_tracks: Option<u32>) -> Option<Release> {
    let score = |r: &Release| -> i32 {
        let mut s = 0;
        if r.status.as_deref() == Some("Official") {
            s += 10;
        }
        let media = r.media.as_deref().unwrap_or(&[]);
        if media.iter().any(|m| m.format.as_deref() == Some("CD")) {
            s += 3;
        }
        if media.len() == 1 && media[0].format.as_deref() == Some("CD") {
            s += 1;
        }
        match r.country.as_deref() {
            Some("TW") | Some("CN") | Some("HK") | Some("MO") => s += 5,
            Some("JP") => s += 2,
            _ => {}
        }
        if let Some(exp) = expect_tracks {
            let got = media
                .iter()
                .map(|m| m.track_count.unwrap_or(0))
                .max()
                .unwrap_or(0);
            s += if got == exp { 8 } else { -4 };
        }
        s
    };
    releases.iter().max_by_key(|r| score(r)).cloned()
}

pub fn release_artists(r: &Release) -> String {
    r.artist_credit
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .map(|a| a.name.clone())
        .collect::<Vec<_>>()
        .join(" / ")
}

/// 取第一张 CD/首媒体的轨道列表
pub fn tracks_of(r: &Release) -> Vec<Track> {
    let media = r.media.as_deref().unwrap_or(&[]);
    let m = media.first();
    m.and_then(|m| m.tracks.clone()).unwrap_or_default()
}
