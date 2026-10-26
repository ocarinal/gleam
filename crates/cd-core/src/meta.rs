//! 专辑介绍 / 歌手简介 (网易云音乐公开接口)
//! 仅作为信息增强, 接口失败时返回 None, 不影响专辑信息页主体。

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const API: &str = "https://music.163.com/api";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AlbumExtra {
    pub album_description: Option<String>,
    pub artist_name: Option<String>,
    pub artist_bio: Option<String>,
    pub artist_avatar: Option<String>,
    pub source: Option<String>,
}

fn get_json(url: &str) -> Result<Value, String> {
    ureq::get(url)
        .set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64)")
        .set("Referer", "https://music.163.com")
        .timeout(Duration::from_secs(10))
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

fn norm(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

fn clean(s: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push('\n');
            }
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    let out = out
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");
    let mut lines: Vec<String> = Vec::new();
    for line in out.lines() {
        let line = line.trim();
        if line.is_empty() {
            if !lines.last().map(|l: &String| l.is_empty()).unwrap_or(true) {
                lines.push(String::new());
            }
        } else {
            lines.push(line.to_string());
        }
    }
    while lines.last().map(|l| l.is_empty()).unwrap_or(false) {
        lines.pop();
    }
    lines.join("\n").trim().to_string()
}

fn year_of(ms: Option<i64>) -> Option<String> {
    let ms = ms?;
    if ms <= 0 {
        return None;
    }
    // publishTime 是毫秒时间戳; 用简单算法避免引入 chrono
    let secs = ms / 1000;
    let days = secs / 86400;
    // 1970-01-01 + days
    let mut y = 1970i64;
    let mut d = days;
    loop {
        let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
        let yd = if leap { 366 } else { 365 };
        if d >= yd {
            d -= yd;
            y += 1;
        } else {
            break;
        }
    }
    Some(format!("{y:04}"))
}

struct AlbumHit {
    id: u64,
    name: String,
    artist: String,
    artist_id: Option<u64>,
    publish_time: Option<i64>,
    size: Option<u64>,
}

fn album_hits(album: &str, artist: &str) -> Vec<AlbumHit> {
    let q = format!("{album} {artist}");
    let url = format!("{API}/search/get/web?s={}&type=10&limit=12&offset=0", enc(&q));
    let Ok(v) = get_json(&url) else {
        return Vec::new();
    };
    let Some(items) = v
        .get("result")
        .and_then(|r| r.get("albums"))
        .and_then(|a| a.as_array())
    else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|a| {
            let id = a.get("id")?.as_u64()?;
            let name = a.get("name")?.as_str()?.to_string();
            let artist_obj = a.get("artist");
            let artist = artist_obj
                .and_then(|x| x.get("name"))
                .and_then(|x| x.as_str())
                .or_else(|| {
                    a.get("artists")
                        .and_then(|x| x.as_array())
                        .and_then(|x| x.first())
                        .and_then(|x| x.get("name"))
                        .and_then(|x| x.as_str())
                })
                .unwrap_or("")
                .to_string();
            let artist_id = artist_obj
                .and_then(|x| x.get("id"))
                .and_then(|x| x.as_u64())
                .or_else(|| {
                    a.get("artists")
                        .and_then(|x| x.as_array())
                        .and_then(|x| x.first())
                        .and_then(|x| x.get("id"))
                        .and_then(|x| x.as_u64())
                });
            Some(AlbumHit {
                id,
                name,
                artist,
                artist_id,
                publish_time: a.get("publishTime").and_then(|x| x.as_i64()),
                size: a.get("size").and_then(|x| x.as_u64()),
            })
        })
        .collect()
}

fn artist_search(artist: &str) -> Option<(u64, String)> {
    let url = format!("{API}/search/get/web?s={}&type=100&limit=6&offset=0", enc(artist));
    let v = get_json(&url).ok()?;
    let items = v
        .get("result")
        .and_then(|r| r.get("artists"))
        .and_then(|a| a.as_array())?;
    let target = norm(artist);
    let mut best: Option<(u64, String, i32)> = None;
    for a in items {
        let Some(id) = a.get("id").and_then(|x| x.as_u64()) else { continue };
        let Some(name) = a.get("name").and_then(|x| x.as_str()).map(str::to_string) else { continue };
        let n = norm(&name);
        let sc = if n == target {
            100
        } else if n.contains(&target) || target.contains(&n) {
            60
        } else {
            0
        };
        if best.as_ref().map(|b| sc > b.2).unwrap_or(true) {
            best = Some((id, name, sc));
        }
    }
    best.map(|(id, name, _)| (id, name))
}

fn artist_detail(id: u64) -> Option<(String, Option<String>, Option<String>)> {
    let url = format!("{API}/artist/{id}?ext=true");
    let v = get_json(&url).ok()?;
    let a = v.get("artist")?;
    let name = a
        .get("name")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let bio = a
        .get("briefDesc")
        .and_then(|x| x.as_str())
        .map(clean)
        .filter(|s| !s.is_empty());
    let avatar = a
        .get("picUrl")
        .and_then(|x| x.as_str())
        .or_else(|| a.get("img1v1Url").and_then(|x| x.as_str()))
        .map(|s| s.to_string())
        .filter(|s| s.starts_with("http"));
    Some((name, bio, avatar))
}

fn album_detail(id: u64) -> Option<(Option<String>, Option<String>)> {
    let url = format!("{API}/album/{id}");
    let v = get_json(&url).ok()?;
    let a = v.get("album")?;
    let desc = a
        .get("description")
        .and_then(|x| x.as_str())
        .map(clean)
        .filter(|s| !s.is_empty());
    let company = a.get("company").and_then(|x| x.as_str()).map(str::to_string);
    Some((desc, company))
}

/// QQ 音乐专辑介绍 (网易云对部分日文专辑 description 为空)
fn qq_album_desc(album: &str, artist: &str) -> Option<(String, Option<String>)> {
    let q = format!("{album} {artist}");
    let search = format!(
        "https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=6&w={}&format=json",
        enc(&q)
    );
    let v = ureq::get(&search)
        .set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64)")
        .set("Referer", "https://y.qq.com/")
        .timeout(Duration::from_secs(10))
        .call()
        .ok()?
        .into_json::<Value>()
        .ok()?;
    let songs = v
        .get("data")
        .and_then(|d| d.get("song"))
        .and_then(|s| s.get("list"))
        .and_then(|l| l.as_array())?;
    let mut mid = None;
    for s in songs {
        let name = s.get("albumname").and_then(|x| x.as_str()).unwrap_or("");
        let singer = s
            .get("singer")
            .and_then(|x| x.as_array())
            .and_then(|x| x.first())
            .and_then(|x| x.get("name"))
            .and_then(|x| x.as_str())
            .unwrap_or("");
        let na = norm(name);
        let nt = norm(album);
        let sa = norm(singer);
        let st = norm(artist);
        if (na == nt || na.contains(&nt) || nt.contains(&na))
            && (st.is_empty() || sa.contains(&st) || st.contains(&sa))
        {
            mid = s.get("albummid").and_then(|x| x.as_str()).map(str::to_string);
            break;
        }
    }
    let mid = mid?;
    let url = format!(
        "https://c.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg?albummid={mid}&format=json"
    );
    let v = ureq::get(&url)
        .set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64)")
        .set("Referer", "https://y.qq.com/")
        .timeout(Duration::from_secs(10))
        .call()
        .ok()?
        .into_json::<Value>()
        .ok()?;
    let d = v.get("data")?;
    let desc = d
        .get("desc")
        .and_then(|x| x.as_str())
        .map(clean)
        .filter(|s| !s.is_empty())?;
    let date = d.get("aDate").and_then(|x| x.as_str()).map(str::to_string);
    Some((desc, date))
}

/// 查询专辑介绍 + 歌手简介
pub fn fetch(
    album: &str,
    artist: &str,
    year: Option<&str>,
    track_count: Option<u32>,
) -> Option<AlbumExtra> {
    let target_year = year.map(|s| s.to_string());
    let mut hits = album_hits(album, artist);
    let score = |h: &AlbumHit| -> i32 {
        let mut sc = 0;
        let na = norm(&h.name);
        let nt = norm(album);
        if na == nt {
            sc += 70;
        } else if na.contains(&nt) || nt.contains(&na) {
            sc += 25;
        } else {
            sc -= 15;
        }
        if !artist.is_empty() {
            let ha = norm(&h.artist);
            let ta = norm(artist);
            if ha == ta || ha.contains(&ta) || ta.contains(&ha) {
                sc += 35;
            }
        }
        if let (Some(y), Some(hy)) = (target_year.as_deref(), year_of(h.publish_time)) {
            if y == hy {
                sc += 12;
            }
        }
        if let (Some(c), Some(s)) = (track_count, h.size) {
            if c as u64 == s {
                sc += 10;
            }
        }
        sc
    };
    hits.sort_by(|a, b| score(b).cmp(&score(a)));
    let best = hits.into_iter().next();

    let mut description = None;
    let mut desc_source: Option<&str> = None;
    let mut artist_name = None;
    let mut artist_bio = None;
    let mut artist_avatar = None;
    let mut artist_id = None;

    if let Some(h) = best {
        if let Some((desc, _company)) = album_detail(h.id) {
            description = desc;
            if description.is_some() {
                desc_source = Some("网易云音乐");
            }
        }
        artist_id = h.artist_id;
        if !h.artist.is_empty() {
            artist_name = Some(h.artist);
        }
    }

    if artist_id.is_none() {
        if let Some((_, name)) = artist_search(artist) {
            artist_name.get_or_insert(name);
        }
    }
    if let Some(id) = artist_id {
        if let Some((name, bio, avatar)) = artist_detail(id) {
            if artist_name.is_none() && !name.is_empty() {
                artist_name = Some(name);
            }
            artist_bio = bio;
            artist_avatar = avatar;
        }
    }
    // 专辑接口没给歌手 id 时, 直接按名字搜歌手
    if artist_bio.is_none() && !artist.is_empty() {
        if let Some((id, name)) = artist_search(artist) {
            if artist_name.is_none() {
                artist_name = Some(name);
            }
            if let Some((_, bio, avatar)) = artist_detail(id) {
                artist_bio = bio;
                artist_avatar = avatar;
            }
        }
    }

    if description.is_none() {
        if let Some((desc, _date)) = qq_album_desc(album, artist) {
            description = Some(desc);
            desc_source = Some("QQ音乐");
        }
    }
    if description.is_none() && artist_bio.is_none() && artist_name.is_none() {
        return None;
    }
    let source = match (desc_source, artist_bio.is_some() || artist_avatar.is_some()) {
        (Some(d), true) if d != "网易云音乐" => format!("{d} / 网易云音乐"),
        (Some(d), _) => d.to_string(),
        (None, _) => "网易云音乐".into(),
    };
    Some(AlbumExtra {
        album_description: description,
        artist_name,
        artist_bio,
        artist_avatar,
        source: Some(source),
    })
}
