//! 封面: Cover Art Archive (会重定向到 archive.org, 先预检)
//! 下载必须做完整性校验：`.take(n)` 截断不会报错，曾把 3.34MB 的 PNG
//! 截成 3MB 后写进缓存，WebKit 解码失败 -> 界面永远没有封面。

use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

const CAA_API: &str = "https://coverartarchive.org";
/// 单张封面大小上限 (data URL 还要再膨胀 1/3，不能无限大)
pub const MAX_IMAGE_BYTES: usize = 12 * 1024 * 1024;

/// 按文件头识别图片格式 (不信任 URL 后缀 / Content-Type)
pub fn image_ext(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("jpg")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else {
        None
    }
}

/// 图片数据是否完整:
/// - PNG 必须以 IEND 块结尾
/// - JPEG 必须以 EOI (FF D9) 结尾
/// - WebP 的 RIFF 长度字段必须覆盖实际数据
pub fn is_complete_image(bytes: &[u8]) -> bool {
    match image_ext(bytes) {
        Some("png") => bytes.len() >= 20 && bytes.ends_with(b"IEND\xaeB`\x82"),
        Some("jpg") => bytes.len() >= 4 && bytes.ends_with(b"\xff\xd9"),
        Some("webp") => {
            if bytes.len() < 12 {
                return false;
            }
            let riff =
                u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as usize + 8;
            riff >= 12 && bytes.len() >= riff
        }
        _ => false,
    }
}

fn read_image_body(resp: ureq::Response) -> Result<Vec<u8>, String> {
    // 有 Content-Length 时先挡掉超大图，避免白下载
    if let Some(len) = resp
        .header("Content-Length")
        .and_then(|v| v.parse::<usize>().ok())
    {
        if len > MAX_IMAGE_BYTES {
            return Err(format!("封面过大: {len} 字节"));
        }
    }
    let mut buf = Vec::new();
    resp.into_reader()
        .take(MAX_IMAGE_BYTES as u64 + 1)
        .read_to_end(&mut buf)
        .map_err(|e| format!("读取封面失败: {e}"))?;
    if buf.len() > MAX_IMAGE_BYTES {
        return Err(format!(
            "封面超过 {} MiB",
            MAX_IMAGE_BYTES / 1024 / 1024
        ));
    }
    if !is_complete_image(&buf) {
        return Err("封面数据不完整（下载被截断）".into());
    }
    Ok(buf)
}

/// 从网络读取一张完整图片
pub fn download_image(url: &str, timeout: Duration) -> Result<Vec<u8>, String> {
    let resp = crate::http::get(url)
        .set("User-Agent", crate::USER_AGENT)
        .timeout(timeout)
        .call()
        .map_err(|e| format!("{e}"))?;
    read_image_body(resp)
}

/// 已下载封面查找: covers/ 中文件名含 release_id 前 8 位的文件
/// 存在多份时取"修改时间最新"的一份 (手动上传的封面永远优先)
/// 截断/损坏的历史文件会被跳过，让调用方重新下载。
pub fn find_cached(release_id: &str, out_dir: &Path) -> Option<PathBuf> {
    let key = release_id.chars().take(8).collect::<String>();
    let rd = std::fs::read_dir(out_dir).ok()?;
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if !name.contains(&key) {
            continue;
        }
        let path = e.path();
        let valid = std::fs::read(&path)
            .map(|b| is_complete_image(&b))
            .unwrap_or(false);
        if !valid {
            continue;
        }
        let mt = e.metadata().and_then(|m| m.modified()).ok();
        if let Some((t, _)) = &best {
            if let Some(mt) = mt {
                if mt <= *t {
                    continue;
                }
            }
        }
        best = Some((mt.unwrap_or(std::time::UNIX_EPOCH), path));
    }
    best.map(|(_, p)| p)
}

pub fn fetch(
    release_id: &str,
    rg_id: Option<&str>,
    out_dir: &Path,
    label: &str,
) -> Result<Option<PathBuf>, String> {
    // 本地缓存优先: 加载过就不再联网
    if let Some(cached) = find_cached(release_id, out_dir) {
        return Ok(Some(cached));
    }
    // 不再预检 archive.org (会给实际可达的环境误报); 超时由请求层兜底
    let mut tries: Vec<String> = vec![
        format!("{CAA_API}/release/{release_id}/front-500"),
        format!("{CAA_API}/release/{release_id}/front-250"),
    ];
    if let Some(rg) = rg_id {
        // release-group 图可能属于同组其它版本 (例如单曲拿到专辑封面), 放最后
        tries.push(format!("{CAA_API}/release-group/{rg}/front-500"));
    }

    std::fs::create_dir_all(out_dir).map_err(|e| format!("无法创建封面目录: {e}"))?;
    for url in tries {
        match crate::http::get(&url)
            .set("User-Agent", crate::USER_AGENT)
            .timeout(Duration::from_secs(15))
            .call()
        {
            Ok(resp) => {
                // 太大或被截断: 继续试下一档尺寸，绝不落盘半张图
                let buf = match read_image_body(resp) {
                    Ok(b) => b,
                    Err(_) => continue,
                };
                let ext = image_ext(&buf).unwrap_or("jpg");
                let short: String = release_id.chars().take(8).collect();
                let path = out_dir.join(format!("{label}-{short}.{ext}"));
                std::fs::write(&path, &buf).map_err(|e| format!("保存封面失败: {e}"))?;
                return Ok(Some(path));
            }
            Err(ureq::Error::Status(404, _)) => continue,
            Err(ureq::Error::Status(code, _)) if code < 500 => break,
            // 网络层失败(超时/拒绝): 换 URL 也无意义, 快速结束
            Err(_) => break,
        }
    }
    Ok(None)
}
