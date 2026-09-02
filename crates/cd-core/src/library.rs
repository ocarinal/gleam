//! 本地光盘缓存库: DiscID -> Release 快照 (library.json)
//! 已知光盘下次直接命中, 不发网络请求

use std::path::{Path, PathBuf};

pub struct Library {
    path: PathBuf,
    data: serde_json::Value,
}

impl Library {
    pub fn load(dir: &Path) -> Library {
        let _ = std::fs::create_dir_all(dir);
        let path = dir.join("library.json");
        let data = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(|| serde_json::json!({ "discs": {} }));
        Library { path, data }
    }

    pub fn get(&self, discid: &str) -> Option<serde_json::Value> {
        self.data.get("discs").and_then(|d| d.get(discid)).cloned()
    }

    /// 本地光盘库列表: (discid, release JSON 快照)
    pub fn entries(&self) -> Vec<(String, serde_json::Value)> {
        self.data
            .get("discs")
            .and_then(|d| d.as_object())
            .map(|m| {
                m.iter()
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    }

    pub fn put(&mut self, discid: &str, release: &serde_json::Value) {
        self.data["discs"][discid] = serde_json::json!({
            "release": release,
            "savedAt": chrono_now(),
        });
        self.save();
    }

    fn save(&self) {
        if let Ok(s) = serde_json::to_string_pretty(&self.data) {
            let _ = std::fs::write(&self.path, s);
        }
    }
}

fn chrono_now() -> String {
    // 简单 ISO 时间 (不引入 chrono 依赖)
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // 天/时/分 从 epoch 简单转换 (仅用于显示)
    format!("epoch-{secs}")
}

impl Library {
    /// 编辑本地元数据 (覆盖标题/艺术家), 持久化
    pub fn update(&mut self, discid: &str, title: Option<&str>, artist: Option<&str>) {
        let release = &mut self.data["discs"][discid]["release"];
        if let Some(t) = title {
            if !t.trim().is_empty() {
                release["title"] = serde_json::json!(t.trim());
            }
        }
        if let Some(a) = artist {
            if !a.trim().is_empty() {
                release["artist-credit"] = serde_json::json!([{ "name": a.trim() }]);
            }
        }
        self.save();
    }

    /// 从光盘库移除
    pub fn remove(&mut self, discid: &str) {
        if let Some(discs) = self.data.get_mut("discs").and_then(|d| d.as_object_mut()) {
            discs.remove(discid);
        }
        self.save();
    }

    /// 读取条目选定的碟片序号 (双碟 A/B)
    pub fn medium(&self, discid: &str) -> Option<u32> {
        self.data["discs"][discid]["medium"].as_u64().map(|v| v as u32)
    }

    /// 记录条目对应的碟片 (A=0, B=1 ...)
    pub fn set_medium(&mut self, discid: &str, idx: u32) {
        self.data["discs"][discid]["medium"] = serde_json::json!(idx);
        self.save();
    }
}
