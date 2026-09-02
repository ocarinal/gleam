//! 封面: Cover Art Archive (会重定向到 archive.org, 先预检)

use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

const CAA_API: &str = "https://coverartarchive.org";

/// 已下载封面查找: covers/ 中文件名含 release_id 前 8 位的文件
/// 存在多份时取"修改时间最新"的一份 (手动上传的封面永远优先)
pub fn find_cached(release_id: &str, out_dir: &Path) -> Option<PathBuf> {
    let key = release_id.chars().take(8).collect::<String>();
    let rd = std::fs::read_dir(out_dir).ok()?;
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if !name.contains(&key) {
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
        best = Some((mt.unwrap_or(std::time::UNIX_EPOCH), e.path()));
    }
    best.map(|(_, p)| p)
}

pub fn fetch(release_id: &str, rg_id: Option<&str>, out_dir: &Path, label: &str) -> Result<Option<PathBuf>, String> {
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
        tries.insert(0, format!("{CAA_API}/release-group/{rg}/front-500"));
    }

    std::fs::create_dir_all(out_dir).map_err(|e| format!("无法创建封面目录: {e}"))?;
    for url in tries {
        match ureq::get(&url)
            .set("User-Agent", crate::USER_AGENT)
            .timeout(Duration::from_secs(15))
            .call()
        {
            Ok(resp) => {
                let mut buf = Vec::new();
                if let Err(e) = resp.into_reader().take(3_000_000).read_to_end(&mut buf) {
                    return Err(format!("下载封面失败: {e}"));
                }
                let ext = if buf.starts_with(b"\x89PNG\r\n\x1a\n") {
                    "png"
                } else {
                    "jpg"
                };
                let short = &release_id[..8.min(release_id.len())];
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
