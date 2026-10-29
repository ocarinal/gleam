//! Tauri 命令层 — 把 cd-core 逻辑暴露给前端

use std::path::PathBuf;
use std::sync::mpsc::{channel, Sender};
use std::sync::{Mutex, OnceLock};

use cd_core::{
    cover, discid::Toc, library::Library, lyrics, mb, meta, netease, player::Player, toc,
};
use serde::Serialize;
use tauri::{Emitter, Manager};

static EVT_TX: OnceLock<Sender<serde_json::Value>> = OnceLock::new();

struct AppState {
    player: Mutex<Option<Player>>,
    library: Mutex<Library>,
    /// 歌词缓存: track 键 -> 结果 (连带负缓存, 避免连播时重复打 API)
    lyric_cache: Mutex<std::collections::HashMap<String, serde_json::Value>>,
    /// TOC 曲目时长(秒), mpv 总进度 -> 当前曲目进度的换算基准
    toc_durations: Mutex<Vec<f64>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TrackInfo {
    no: u8,
    duration_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TocInfo {
    device: String,
    track_count: u32,
    discid: String,
    toc_string: String,
    tracks: Vec<TrackInfo>,
}

#[derive(Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LyricsResult {
    lrc: String,
    tlyric: Option<String>,
    synced: bool,
    source: String,
    /// 兼容旧字段: 封面由封面管线负责，这里暂时为空
    cover: Option<String>,
    bilingual: bool,
    word_timed: bool,
}

fn cache_dir() -> PathBuf {
    let base = std::env::var("SOUNDDISC_CACHE")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
            PathBuf::from(home).join(".cache/sounddisc")
        });
    let _ = std::fs::create_dir_all(&base);
    base
}

// ---------- 标准 base64 (封面 data URL 用) ----------
fn b64(data: &[u8]) -> String {
    const CHARS: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
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
        1 => out.push_str("=="),
        2 => out.push('='),
        _ => {}
    }
    out
}

fn urlenc(s: &str) -> String {
    let mut out = String::new();
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(*b as char),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

// ---------- 命令 ----------

#[tauri::command]
async fn detect_disc(state: tauri::State<'_, AppState>) -> Result<TocInfo, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let device = toc::auto_device()?;
        let t: Toc = toc::read_toc(&device)?;
        let discid = cd_core::discid::compute_disc_id(&t)?;
        let durations: Vec<u64> = t.track_durations_ms();
        let tracks: Vec<TrackInfo> = durations
            .iter()
            .enumerate()
            .map(|(i, ms)| TrackInfo {
                no: i as u8 + 1,
                duration_ms: *ms,
            })
            .collect();
        Ok((TocInfo {
            device,
            track_count: tracks.len() as u32,
            discid,
            toc_string: t.toc_string(),
            tracks,
        }, durations))
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))?
    .map(|(info, durations)| {
        *state.toc_durations.lock().unwrap() = durations.iter().map(|ms| *ms as f64 / 1000.0).collect();
        info
    })
}

/// 识别进度事件: 前端据此显示读取/查询阶段
fn emit_identify(
    app: &tauri::AppHandle,
    stage: &str,
    message: &str,
    detail: Option<String>,
    done: bool,
    ok: bool,
) {
    let _ = app.emit(
        "identify-progress",
        serde_json::json!({
            "stage": stage,
            "message": message,
            "detail": detail,
            "done": done,
            "ok": ok,
        }),
    );
}

/// 缓存优先的识别: 库里有的盘直接返回, 否则 MusicBrainz 查询并写入缓存
#[tauri::command]
async fn resolve_disc(
    discid: String,
    device: Option<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<serde_json::Value>, String> {
    let discid2 = discid.clone();
    if let Some(v) = state.library.lock().unwrap().get(&discid) {
        let rel: mb::Release = serde_json::from_value(v.get("release").cloned().unwrap_or_default())
            .map_err(|e| format!("缓存解析失败: {e}"))?;
        let medium = v.get("medium").and_then(|m| m.as_u64()).unwrap_or(0) as u32;
        emit_identify(
            &app,
            "cache",
            "使用本地缓存",
            Some(rel.title.clone()),
            true,
            true,
        );
        return Ok(Some(serde_json::json!({ "release": rel, "medium": medium })));
    }

    emit_identify(
        &app,
        "discid",
        "查询 MusicBrainz DiscID…",
        None,
        false,
        false,
    );
    let rels = tauri::async_runtime::spawn_blocking(move || mb::lookup_by_discid(&discid2))
        .await
        .map_err(|e| format!("任务失败: {e}"))??;

    if rels.is_empty() {
        // DiscID 没收录时: 读取 MCN/ISRC, 先按条码再按 ISRC 找发行版
        let Some(dev) = device else {
            emit_identify(
                &app,
                "notfound",
                "未能自动识别",
                Some("DiscID 未收录，且没有可用的光驱设备信息。可以手动搜索专辑。".into()),
                true,
                false,
            );
            return Ok(None);
        };
        emit_identify(
            &app,
            "extra",
            "读取光盘 MCN / ISRC…",
            None,
            false,
            false,
        );
        let extras = tauri::async_runtime::spawn_blocking(move || toc::read_extras(&dev))
            .await
            .map_err(|e| format!("任务失败: {e}"))?;
        let track_count = state.toc_durations.lock().unwrap().len();

        if let Some(mcn) = extras.mcn.clone() {
            emit_identify(
                &app,
                "barcode",
                "按光盘条码搜索 MusicBrainz…",
                Some(mcn.clone()),
                false,
                false,
            );
            let tc = if track_count > 0 { track_count } else { 1 };
            let by_code = tauri::async_runtime::spawn_blocking(move || {
                mb::resolve_by_barcode(&mcn, tc).ok().flatten()
            })
            .await
            .map_err(|e| format!("任务失败: {e}"))?;
            if let Some(full) = by_code {
                if let Ok(v) = serde_json::to_value(&full) {
                    state.library.lock().unwrap().put(&discid, &v);
                }
                emit_identify(
                    &app,
                    "done",
                    "识别完成",
                    Some(full.title.clone()),
                    true,
                    true,
                );
                return Ok(Some(serde_json::json!({ "release": full, "medium": 0 })));
            }
        }

        let isrcs: Vec<String> = extras.isrcs.iter().map(|(_, s)| s.clone()).collect();
        if !isrcs.is_empty() {
            emit_identify(
                &app,
                "isrc",
                "按 ISRC 搜索发行版…",
                Some(format!("{} 个 ISRC", isrcs.len())),
                false,
                false,
            );
            let tc = if track_count > 0 { track_count } else { isrcs.len() };
            let by_isrc = tauri::async_runtime::spawn_blocking(move || {
                mb::resolve_by_isrcs(&isrcs, tc).ok().flatten()
            })
            .await
            .map_err(|e| format!("任务失败: {e}"))?;
            if let Some(full) = by_isrc {
                if let Ok(v) = serde_json::to_value(&full) {
                    state.library.lock().unwrap().put(&discid, &v);
                }
                emit_identify(
                    &app,
                    "done",
                    "识别完成",
                    Some(full.title.clone()),
                    true,
                    true,
                );
                return Ok(Some(serde_json::json!({ "release": full, "medium": 0 })));
            }
        }

        let detail = if extras.mcn.is_none() && extras.isrcs.is_empty() {
            "DiscID 未收录；也没有读到 MCN / ISRC。可能是自刻盘或 MusicBrainz 没有这张发行版，请用「搜索专辑」手动匹配。".to_string()
        } else {
            "DiscID 未收录；MCN / ISRC 也没能匹配到对应发行版。请用「搜索专辑」手动匹配。".to_string()
        };
        emit_identify(&app, "notfound", "未能自动识别", Some(detail), true, false);
        return Ok(None);
    }

    let best = mb::pick_release(&rels, None).ok_or("无候选")?;
    emit_identify(
        &app,
        "release",
        "读取发行版详情…",
        Some(best.title.clone()),
        false,
        false,
    );
    let full = tauri::async_runtime::spawn_blocking(move || mb::get_release(&best.id))
        .await
        .map_err(|e| format!("任务失败: {e}"))??;
    let v = serde_json::to_value(&full).map_err(|e| format!("序列化失败: {e}"))?;
    state.library.lock().unwrap().put(&discid, &v);
    emit_identify(
        &app,
        "done",
        "识别完成",
        Some(full.title.clone()),
        true,
        true,
    );
    Ok(Some(serde_json::json!({ "release": full, "medium": 0 })))
}

/// 用户搜索确认后, 建立 DiscID -> Release 的本地映射
#[tauri::command]
async fn confirm_release_for_disc(
    discid: String,
    release_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<mb::Release, String> {
    let full = tauri::async_runtime::spawn_blocking(move || mb::get_release(&release_id))
        .await
        .map_err(|e| format!("任务失败: {e}"))??;
    let v = serde_json::to_value(&full).map_err(|e| format!("序列化失败: {e}"))?;
    state.library.lock().unwrap().put(&discid, &v);
    Ok(full)
}

#[tauri::command]
async fn search_releases(query: String) -> Result<Vec<mb::Release>, String> {
    tauri::async_runtime::spawn_blocking(move || mb::search_releases(&query))
        .await
        .map_err(|e| format!("任务失败: {e}"))?
}

#[tauri::command]
async fn get_release(id: String) -> Result<mb::Release, String> {
    tauri::async_runtime::spawn_blocking(move || mb::get_release(&id))
        .await
        .map_err(|e| format!("任务失败: {e}"))?
}

/// 打开 MusicBrainz 提交 DiscID:
/// 已识别发行版 -> 直达该专辑的 add-discid 页;
/// 未识别 -> DiscID 搜索页(从结果里找对应发行版进入提交)
#[tauri::command]
fn open_mb_submit(toc_string: String, release_id: Option<String>) -> Result<(), String> {
    let toc_enc = urlenc(&toc_string);
    let url = match release_id.as_deref() {
        Some(id) => format!("https://musicbrainz.org/release/{id}/add-discid?toc={toc_enc}"),
        None => format!("https://musicbrainz.org/search?type=discid&query={toc_enc}"),
    };
    open_url(&url)
}

#[tauri::command]
fn open_mb_release(release_id: String) -> Result<(), String> {
    open_url(&format!("https://musicbrainz.org/release/{release_id}"))
}

/// 在流媒体站点搜索这张专辑 (点击库卡片默认行为)
#[tauri::command]
fn open_stream_search(
    album: String,
    artist: String,
    service: Option<String>,
    kind: Option<String>,
) -> Result<(), String> {
    let q = format!("{} {}", album.trim(), artist.trim())
        .trim()
        .to_string();
    if q.is_empty() {
        return Err("专辑名为空".into());
    }
    let svc = service.as_deref().unwrap_or("netease");
    let song = kind.as_deref() == Some("song");
    let url = match svc {
        "qq" => format!(
            "https://y.qq.com/n/ryqq/search?w={}&t={}",
            urlenc(&q),
            if song { "song" } else { "album" }
        ),
        _ => format!(
            "https://music.163.com/#/search/m/?s={}&type={}",
            urlenc(&q),
            if song { "1" } else { "10" }
        ),
    };
    open_url(&url)
}

fn open_url(url: &str) -> Result<(), String> {
    if let Err(e) = std::process::Command::new("xdg-open").arg(url).spawn() {
        return Err(format!("打开浏览器失败: {e}"));
    }
    Ok(())
}

/// 封面管线: 缓存 -> 网易云(落盘) -> CAA -> data URL
fn resolve_cover(
    release_id: &str,
    rg_id: Option<String>,
    title: &str,
    artist: &str,
    dir: &std::path::Path,
) -> Option<String> {
    let label: String = release_id.chars().take(8).collect();
    let file_of = |p: &std::path::Path| -> Option<String> {
        let bytes = std::fs::read(p).ok()?;
        // 历史缓存里可能有被截断的文件，不能直接交给 WebView
        if !cover::is_complete_image(&bytes) {
            return None;
        }
        let mime = match cover::image_ext(&bytes)? {
            "png" => "image/png",
            "webp" => "image/webp",
            _ => "image/jpeg",
        };
        Some(format!("data:{mime};base64,{}", b64(&bytes)))
    };
    // 1) 缓存 (最新优先; 截断文件已被 find_cached 跳过)
    if let Some(f) = cover::find_cached(release_id, dir) {
        if let Some(d) = file_of(&f) {
            return Some(d);
        }
    }
    // 2) 网易云: 专辑名优先; 歌曲搜索只作为兜底
    //    (单曲"知らない"同样匹配到歌曲, 歌曲所在专辑可能是 Stranger, 会拿错封面)
    let mut netease_cover = netease::album_cover_url_by_album(title, artist).ok();
    if netease_cover.is_none() {
        if let Ok(songs) = netease::search(title, artist, None) {
            if let Some(best) = songs.first() {
                netease_cover = netease::album_cover_url(best.id).ok();
            }
        }
    }
    if let Some(u) = netease_cover {
        if let Some((mime, bytes)) = netease_cover_bytes(Some(&u)) {
            let ext = match mime.as_str() {
                "image/png" => "png",
                "image/webp" => "webp",
                _ => "jpg",
            };
            let _ = std::fs::create_dir_all(dir);
            let f = dir.join(format!("{label}-{label}.{ext}"));
            let _ = std::fs::write(&f, &bytes);
            return Some(format!("data:{mime};base64,{}", b64(&bytes)));
        }
    }
    // 3) CAA (网易云没有时兜底)
    if let Ok(Some(path)) = cover::fetch(release_id, rg_id.as_deref(), dir, &label) {
        if let Some(d) = file_of(&path) {
            return Some(d);
        }
    }
    None
}

#[tauri::command]
async fn fetch_cover(
    release_id: String,
    rg_id: Option<String>,
    title: String,
    artist: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = cache_dir().join("covers");
        Ok(resolve_cover(&release_id, rg_id, &title, &artist, &dir))
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

/// 强制刷新封面: 清空该碟本地缓存后重新获取并落盘
#[tauri::command]
async fn refresh_cover(
    release_id: String,
    rg_id: Option<String>,
    title: String,
    artist: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = cache_dir().join("covers");
        let label: String = release_id.chars().take(8).collect();
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for f in rd.flatten() {
                let name = f.file_name().to_string_lossy().to_string();
                if name.contains(&label) {
                    let _ = std::fs::remove_file(f.path());
                }
            }
        }
        Ok(resolve_cover(&release_id, rg_id, &title, &artist, &dir))
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

/// 标准 base64 解码 (data URL 还原用)
fn base64_decode(s: &str) -> Option<Vec<u8>> {
    const REV: [i8; 256] = {
        let mut r = [-1i8; 256];
        let mut i = 0u8;
        while i < 64 {
            let c: u8 = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[i as usize];
            r[c as usize] = i as i8;
            i += 1;
        }
        r
    };
    let mut out = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0u32;
    for &c in s.as_bytes() {
        if c == b'=' {
            break;
        }
        let v = REV[c as usize];
        if v < 0 {
            continue;
        }
        buf = (buf << 6) | v as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}

#[tauri::command]
async fn fetch_lyrics(
    title: String,
    artist: String,
    length_ms: Option<u64>,
    recording_id: Option<String>,
    force: Option<bool>,
    source: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<LyricsResult, String> {
    let force = force.unwrap_or(false);
    let source = source.unwrap_or_else(|| "auto".to_string());
    // 缓存: 同键+同源直接返回 (force=true 手动重查时绕过)
    let key = format!(
        "{title}|{artist}|{length_ms:?}|{}|{source}",
        recording_id.as_deref().unwrap_or("")
    );
    if !force {
        if let Some(v) = state.lyric_cache.lock().unwrap().get(&key).cloned() {
            return serde_json::from_value(v).map_err(|e| format!("缓存解析失败: {e}"));
        }
    }
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<LyricsResult, String> {
        // 节流: 连播时不要瞬间打爆多个歌词源
        std::thread::sleep(std::time::Duration::from_millis(300));
        let best = if source == "auto" {
            lyrics::collect(&title, &artist, length_ms, recording_id.as_deref())
        } else {
            lyrics::collect_one(&source, &title, &artist, length_ms, recording_id.as_deref())
        };
        let bilingual = best.as_ref().map(|c| c.bilingual()).unwrap_or(false);
        let word_timed = best.as_ref().map(|c| c.word_timed).unwrap_or(false);

        // 诊断日志
        let line = format!(
            "{title} | {artist} | {}\n",
            match &best {
                Some(c) => format!("OK: {}", c.source),
                None => "MISS".into(),
            }
        );
        if std::fs::create_dir_all(cache_dir().join("logs")).is_ok() {
            let path = cache_dir().join("logs/lyrics.log");
            if let Ok(old) = std::fs::read_to_string(&path) {
                let mut lines: Vec<&str> = old.lines().collect();
                if lines.len() > 300 {
                    lines.drain(..lines.len() - 300);
                }
                let _ = std::fs::write(&path, lines.join("\n") + "\n" + &line);
            } else {
                let _ = std::fs::write(&path, line);
            }
        }

        match best {
            Some(c) => Ok(LyricsResult {
                lrc: c.lrc,
                tlyric: c.tlyric,
                synced: c.synced,
                source: c.source,
                cover: None,
                bilingual,
                word_timed,
            }),
            None => Ok(LyricsResult {
                lrc: String::new(),
                tlyric: None,
                synced: false,
                source: format!("{} · 无歌词", lyrics::source_label(Some(&source))),
                cover: None,
                bilingual: false,
                word_timed: false,
            }),
        }
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))??;
    // 写入缓存 (含负缓存)
    if let Ok(v) = serde_json::to_value(&result) {
        state.lyric_cache.lock().unwrap().insert(key, v);
    }
    Ok(result)
}


/// 网易云专辑介绍 + 歌手简介 (信息页右侧)
#[tauri::command]
async fn fetch_album_extra(
    album: String,
    artist: String,
    year: Option<String>,
    track_count: Option<u32>,
    discid: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Option<meta::AlbumExtra>, String> {
    // 先读光盘库缓存; 成功加载过的介绍/简介会一直保留到条目被移除
    if let Some(did) = discid.as_deref() {
        if let Some(v) = state.library.lock().unwrap().album_extra(did) {
            if let Ok(extra) = serde_json::from_value::<meta::AlbumExtra>(v) {
                return Ok(Some(extra));
            }
        }
    }
    let did = discid.clone();
    let result: Option<meta::AlbumExtra> = tauri::async_runtime::spawn_blocking(move || {
        Ok::<Option<meta::AlbumExtra>, String>(meta::fetch(&album, &artist, year.as_deref(), track_count))
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))??;
    if let (Some(did), Some(extra)) = (discid.as_deref(), result.as_ref()) {
        if let Ok(v) = serde_json::to_value(extra) {
            state.library.lock().unwrap().set_album_extra(did, &v);
        }
    }
    Ok(result)
}

/// 手动上传封面: data URL -> 保存到本地封面缓存 (之后全应用复用)
#[tauri::command]
async fn save_cover(release_id: String, data_url: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let prefix = data_url.find(',').map(|i| i + 1).unwrap_or(0);
        let bytes = base64_decode(&data_url[prefix..]).ok_or("封面数据解码失败")?;
        // 按魔数识别格式 (不信任 data URL 声明的 mime)
        if !cover::is_complete_image(&bytes) {
            return Err("封面数据不完整或格式不支持".into());
        }
        let (mime, ext) = match cover::image_ext(&bytes) {
            Some("png") => ("image/png", "png"),
            Some("webp") => ("image/webp", "webp"),
            Some(_) => ("image/jpeg", "jpg"),
            None => return Err("不支持的封面格式".into()),
        };
        let dir = cache_dir().join("covers");
        std::fs::create_dir_all(&dir).map_err(|e| format!("创建封面目录失败: {e}"))?;
        let label: String = release_id.chars().take(8).collect();
        let f = dir.join(format!("{label}-{label}.{ext}"));
        std::fs::write(&f, &bytes).map_err(|e| format!("写入封面失败: {e}"))?;
        // 诊断日志
        let _ = std::fs::create_dir_all(cache_dir().join("logs"));
        let log = format!("save_cover {label} {mime} {}B\n", bytes.len());
        let path = cache_dir().join("logs/cover.log");
        let _ = std::fs::OpenOptions::new().append(true).create(true).open(&path)
            .and_then(|mut f2| { use std::io::Write; f2.write_all(log.as_bytes()) });
        Ok(Some(format!("data:{mime};base64,{}", b64(&bytes))))
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}


/// 编辑本地光盘库条目的元数据 (覆盖标题/艺术家)
#[tauri::command]
async fn library_update(
    discid: String,
    title: Option<String>,
    artist: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.library.lock().unwrap().update(&discid, title.as_deref(), artist.as_deref());
    Ok(())
}


/// 设置收藏库条目对应的碟片 (A=0, B=1 ...)
#[tauri::command]
async fn library_set_medium(
    discid: String,
    idx: u32,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.library.lock().unwrap().set_medium(&discid, idx);
    Ok(())
}

/// 设置碟组 (A/B/C...) / 移出分组
#[tauri::command]
async fn library_set_group(
    discid: String,
    group: Option<String>,
    label: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state
        .library
        .lock()
        .unwrap()
        .set_group(&discid, group.as_deref(), label.as_deref());
    Ok(())
}

/// 从本地光盘库移除
#[tauri::command]
async fn library_remove(
    discid: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.library.lock().unwrap().remove(&discid);
    Ok(())
}

/// 本地光盘库列表
#[tauri::command]
fn list_library(state: tauri::State<'_, AppState>) -> Result<Vec<serde_json::Value>, String> {
    let lib = state.library.lock().unwrap();
    Ok(lib
        .entries()
        .into_iter()
        .map(|(discid, v)| {
            serde_json::json!({
                "discId": discid,
                "release": v.get("release").cloned().unwrap_or_default(),
                "savedAt": v.get("savedAt").cloned().unwrap_or_default(),
                "medium": v.get("medium").cloned().unwrap_or(serde_json::json!(0)),
                "group": v.get("group").cloned().unwrap_or(serde_json::Value::Null),
                "discLabel": v.get("discLabel").cloned().unwrap_or(serde_json::Value::Null),
            })
        })
        .collect())
}

/// 光盘库卡片封面: 缓存文件 -> 网易云(首曲搜索)
#[tauri::command]
async fn library_cover(
    release_id: String,
    title: String,
    artist: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // 1) 已下载的封面缓存 (取最新, 手动上传优先)
        let dir = cache_dir().join("covers");
        if let Some(f) = cover::find_cached(&release_id, &dir) {
            if let Ok(bytes) = std::fs::read(&f) {
                if cover::is_complete_image(&bytes) {
                    let mime = match cover::image_ext(&bytes).unwrap_or("jpg") {
                        "png" => "image/png",
                        "webp" => "image/webp",
                        _ => "image/jpeg",
                    };
                    return Ok(Some(format!("data:{mime};base64,{}", b64(&bytes))));
                }
            }
        }
        // 2) 网易云: 优先按专辑名匹配 (单曲不能拿同组专辑的封面)
        if let Ok(u) = netease::album_cover_url_by_album(&title, &artist) {
            if let Some((mime, bytes)) = netease_cover_bytes(Some(&u)) {
                return Ok(Some(cache_cover_data(&release_id, &mime, &bytes)));
            }
        }
        // 3) 专辑名搜不到时退回歌曲搜索
        if let Ok(songs) = netease::search(&title, &artist, None) {
            if let Some(best) = songs.first() {
                if let Ok(u) = netease::album_cover_url(best.id) {
                    if let Some((mime, bytes)) = netease_cover_bytes(Some(&u)) {
                        return Ok(Some(cache_cover_data(&release_id, &mime, &bytes)));
                    }
                }
            }
        }
        Ok(None)
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

// ---------- 播放器 (集成控制, 无独立窗口) ----------

/// 网易云专辑封面 picUrl -> (mime, bytes)
fn netease_cover_bytes(pic_url: Option<&str>) -> Option<(String, Vec<u8>)> {
    let url = pic_url?;
    if !url.starts_with("http") {
        return None;
    }
    // 网易云原图可能非常大 (甚至把 .jpg 地址返回 PNG)；限到 800px 再下载，
    // 既避免 3MB 级 data URL，也绕开历史上的截断问题。
    let original = url;
    let url = if url.contains("?param=") {
        url.to_string()
    } else if url.contains('?') {
        format!("{url}&param=800y800")
    } else {
        format!("{url}?param=800y800")
    };
    // 复用统一下载器: 12MB 上限 + 完整性校验
    let bytes = cover::download_image(&url, std::time::Duration::from_secs(20))
        // 少数地址不接受 param 参数时退回原图 (仍有 12MB/完整性保护)
        .or_else(|_| cover::download_image(original, std::time::Duration::from_secs(20)))
        .ok()?;
    let mime = match cover::image_ext(&bytes)? {
        "png" => "image/png",
        "webp" => "image/webp",
        _ => "image/jpeg",
    };
    Some((mime.to_string(), bytes))
}

/// 网易云专辑封面 picUrl -> data URL
fn netease_cover_data_url(pic_url: Option<&str>) -> Option<String> {
    let (mime, bytes) = netease_cover_bytes(pic_url)?;
    Some(format!("data:{mime};base64,{}", b64(&bytes)))
}

/// 把下载的封面写入磁盘缓存, 返回可直接给 WebView 的 data URL。
/// 库卡片重新挂载/搜索过滤后就不必再次联网取同一张图。
fn cache_cover_data(release_id: &str, mime: &str, bytes: &[u8]) -> String {
    let dir = cache_dir().join("covers");
    let _ = std::fs::create_dir_all(&dir);
    let ext = match mime {
        "image/png" => "png",
        "image/webp" => "webp",
        _ => "jpg",
    };
    let label: String = release_id.chars().take(8).collect();
    let _ = std::fs::write(dir.join(format!("{label}-{label}.{ext}")), bytes);
    format!("data:{mime};base64,{}", b64(bytes))
}

#[tauri::command]
async fn play_track(
    device: String,
    track_no: u8,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let mut guard = state.player.lock().unwrap();
    if let Some(mut old) = guard.take() {
        old.stop();
    }
    let player = Player::spawn_track(
        &device,
        track_no,
        &cache_dir().join("logs"),
        EVT_TX.get().cloned().ok_or("事件通道未初始化")?,
    )?;
    // 观察进度 (起播前已挂好, 属性变化事件 -> 前端进度条)
    player.start_observe()?;
    *guard = Some(player);
    Ok(format!("第 {track_no} 轨"))
}

#[tauri::command]
async fn player_pause(paused: bool, state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Some(p) = state.player.lock().unwrap().as_ref() {
        p.pause(paused).map_err(|e| e)?;
    }
    Ok(())
}

#[tauri::command]
async fn player_seek(secs: f64, state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Some(p) = state.player.lock().unwrap().as_ref() {
        p.seek(secs).map_err(|e| e)?;
    }
    Ok(())
}

#[tauri::command]
async fn player_stop(state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Some(mut p) = state.player.lock().unwrap().take() {
        p.stop();
    }
    Ok(())
}

#[tauri::command]
async fn player_volume(vol: u8, state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Some(p) = state.player.lock().unwrap().as_ref() {
        p.set_volume(vol)?;
    } else {
        return Err("播放器未启动".into());
    }
    Ok(())
}

#[tauri::command]
async fn eject_disc(state: tauri::State<'_, AppState>) -> Result<String, String> {
    // 弹出前必须先停播放器, 否则设备被占用会弹出失败
    if let Some(mut p) = state.player.lock().unwrap().take() {
        p.stop();
    }
    tauri::async_runtime::spawn_blocking(|| {
        let device = toc::auto_device().map_err(|e| format!("光驱不可用: {e}"))?;
        toc::eject(&device)?;
        Ok(device)
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

/// 介质状态: 零设备命令 ({tray: open|closed|unknown, size: bool})
/// 优先级: 托盘开合 > size (弹出后 size 可能滞后, 托盘开合是即时权威信号)
#[tauri::command]
async fn media_state() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let tray = match cd_core::toc::tray_is_open() {
            Some(true) => "open",
            Some(false) => "closed",
            None => "unknown",
        };
        let mut size = false;
        if let Ok(rd) = std::fs::read_dir("/sys/block") {
            for e in rd.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                if name.starts_with("sr") {
                    if let Ok(sz) = std::fs::read_to_string(e.path().join("size")) {
                        if let Ok(v) = sz.trim().parse::<u64>() {
                            if v > 0 {
                                size = true;
                            }
                        }
                    }
                }
            }
        }
        // 诊断日志 (保留最近 300 行)
        if let Ok(dir) = std::fs::create_dir_all(cache_dir().join("logs")) {
            let _ = dir;
            let path = cache_dir().join("logs/media.log");
            let line = format!("tray={tray} size={size}\n");
            if let Ok(mut old) = std::fs::read_to_string(&path) {
                let mut lines: Vec<&str> = old.lines().collect();
                if lines.len() > 300 {
                    lines.drain(..lines.len() - 300);
                    old = lines.join("\n");
                }
                let _ = std::fs::write(&path, old + &line);
            } else {
                let _ = std::fs::write(&path, line);
            }
        }
        Ok(serde_json::json!({ "tray": tray, "size": size }))
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}


/// 系统字体列表 (fontconfig)
#[tauri::command]
async fn list_fonts() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let out = std::process::Command::new("fc-list")
            .arg(":")
            .arg("family")
            .output();
        let mut fams: Vec<String> = match out {
            Ok(o) => String::from_utf8_lossy(&o.stdout)
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .map(|l| l.split(',').next().unwrap_or("").trim().to_string())
                .filter(|l| !l.is_empty())
                .collect(),
            Err(_) => Vec::new(),
        };
        fams.sort();
        fams.dedup();
        Ok(fams)
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

/// 光驱实时状态: {device, state: disc|empty|unknown}
#[tauri::command]
async fn drive_scan() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let device = toc::auto_device().map_err(|e| format!("光驱不可用: {e}"))?;
        let state = toc::drive_status(&device)?;
        Ok(serde_json::json!({ "device": device, "state": state }))
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

// ---------- 入口 ----------

fn forward_events(app: tauri::AppHandle) {
    let (tx, rx) = channel::<serde_json::Value>();
    let _ = EVT_TX.set(tx);
    std::thread::spawn(move || {
        let mut time = 0.0f64;
        let mut duration = 0.0f64;
        let mut paused = false;
        let mut last = std::time::Instant::now() - std::time::Duration::from_secs(1);
        loop {
            let v = match rx.recv() {
                Ok(v) => v,
                Err(_) => break,
            };
            let name = v.get("name").and_then(|n| n.as_str()).unwrap_or("");
            match name {
                "time-pos" => time = v.get("data").and_then(|d| d.as_f64()).unwrap_or(time),
                "duration" => duration = v.get("data").and_then(|d| d.as_f64()).unwrap_or(duration),
                "pause" => paused = v.get("data").and_then(|d| d.as_bool()).unwrap_or(paused),
                _ => {}
            }
            if let Some(ev) = v.get("event").and_then(|e| e.as_str()) {
                if ev == "idle" || ev == "ended" {
                    let _ = app.emit("player-ended", ());
                } else if ev == "media-change" {
                    let _ = app.emit("drive-media", ());
                }
            }
            if last.elapsed() >= std::time::Duration::from_millis(250) {
                last = std::time::Instant::now();
                let durations = app.state::<AppState>().toc_durations.lock().unwrap().clone();
                // 当前曲目进度: mpv 的 time-pos 是整碟总进度,
                // 用我们自己的 TOC 时长定位当前曲目 (起点/时长完全可控)
                let (mut tt, mut td, mut start, mut tno) = (time, duration, 0.0, 0i64);
                if !durations.is_empty() && time >= 0.0 {
                    let mut acc = 0.0;
                    for (i, d) in durations.iter().enumerate() {
                        let next = acc + d;
                        if time < next || i == durations.len() - 1 {
                            start = acc;
                            tt = (time - acc).max(0.0);
                            td = *d;
                            tno = i as i64 + 1;
                            break;
                        }
                        acc = next;
                    }
                }
                let _ = app.emit(
                    "player-progress",
                    serde_json::json!({
                        "time": tt, "duration": td, "start": start,
                        "trackNo": tno, "paused": paused,
                    }),
                );
            }
        }
    });
}

pub fn run() {
    let library = Library::load(&cache_dir());
    tauri::Builder::default()
        .manage(AppState {
            player: Mutex::new(None),
            library: Mutex::new(library),
            toc_durations: Mutex::new(Vec::new()),
            lyric_cache: Mutex::new(Default::default()),
        })
        .setup(|app| {
            // 高 DPI 屏幕: 整体 UI (元素+文字) 放大 14%, 窗口同步加大保持布局比例
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_zoom(1.15);
            }
            forward_events(app.handle().clone());
            // 被动监听 sr 光盘插拔 (不占用设备, 不触发桥接固件合拢托盘)
            let child = std::process::Command::new("udevadm")
                .args(["monitor", "--udev", "--subsystem-match=block"])
                .stdout(std::process::Stdio::piped())
                .spawn()
                .ok();
            if let Some(mut c) = child {
                if let Some(out) = c.stdout.take() {
                    std::thread::spawn(move || {
                        use std::io::BufRead;
                        let reader = std::io::BufReader::new(out);
                        for line in reader.lines().map_while(Result::ok) {
                            if line.starts_with("KERNEL[") && line.contains("/block/sr") && line.contains("change") {
                                if let Some(tx) = EVT_TX.get() {
                                    let _ = tx.send(serde_json::json!({ "event": "media-change" }));
                                }
                            }
                        }
                    });
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            detect_disc,
            resolve_disc,
            confirm_release_for_disc,
            search_releases,
            get_release,
            open_mb_submit,
            open_mb_release,
            open_stream_search,
            fetch_cover,
            fetch_lyrics,
            fetch_album_extra,
            list_library,
            library_cover,
            play_track,
            player_pause,
            player_seek,
            player_stop,
            player_volume,
            eject_disc,
            drive_scan,
            media_state,
            save_cover,
            list_fonts,
            library_update,
            library_remove,
            library_set_medium,
            library_set_group
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
