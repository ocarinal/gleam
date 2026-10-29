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
        // 重新插入同一张碟时保留碟组/碟片标记, 否则 A/B/C 编组会丢
        let old = self
            .data
            .get("discs")
            .and_then(|d| d.get(discid))
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        let group = old.get("group").cloned();
        let label = old.get("discLabel").cloned();
        let medium = old.get("medium").cloned();
        // 专辑介绍/歌手简介属于这张碟的缓存, 重新插入同一张碟时保留
        let extra = old.get("albumExtra").cloned();
        self.data["discs"][discid] = serde_json::json!({
            "release": release,
            "savedAt": chrono_now(),
        });
        if let Some(g) = group {
            self.data["discs"][discid]["group"] = g;
        }
        if let Some(l) = label {
            self.data["discs"][discid]["discLabel"] = l;
        }
        if let Some(m) = medium {
            self.data["discs"][discid]["medium"] = m;
        }
        if let Some(e) = extra {
            self.data["discs"][discid]["albumExtra"] = e;
            if let Some(v) = old.get("albumExtraVersion") {
                self.data["discs"][discid]["albumExtraVersion"] = v.clone();
            }
        }
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
                // 内部 JSON 统一用 camelCase (与 mb::Release 的序列化键一致)
                if let Some(obj) = release.as_object_mut() {
                    obj.remove("artist-credit");
                }
                release["artistCredit"] = serde_json::json!([{ "name": a.trim() }]);
            }
        }
        self.save();
    }

    /// 读取已缓存的专辑介绍 / 歌手简介
    pub fn album_extra(&self, discid: &str) -> Option<serde_json::Value> {
        let entry = self.data.get("discs")?.get(discid)?;
        // v2: 区分专辑/歌手来源; 旧缓存没有版本号, 忽略一次并重新加载
        if entry.get("albumExtraVersion").and_then(|v| v.as_u64())? < 2 {
            return None;
        }
        entry.get("albumExtra").cloned()
    }

    /// 成功加载后写入条目; 条目不存在时忽略 (只缓存光盘库里的碟)
    pub fn set_album_extra(&mut self, discid: &str, extra: &serde_json::Value) {
        if self
            .data
            .get("discs")
            .and_then(|d| d.get(discid))
            .is_none()
        {
            return;
        }
        self.data["discs"][discid]["albumExtra"] = extra.clone();
        self.data["discs"][discid]["albumExtraVersion"] = serde_json::json!(2);
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

    /// 设置碟组 (A/B/C...) 与组内标签; group=None 表示移出分组
    pub fn set_group(&mut self, discid: &str, group: Option<&str>, label: Option<&str>) {
        if !self.data["discs"][discid].is_object() {
            return;
        }
        match (group, label) {
            (Some(g), Some(l)) => {
                self.data["discs"][discid]["group"] = serde_json::json!(g);
                self.data["discs"][discid]["discLabel"] = serde_json::json!(l);
            }
            (Some(g), None) => {
                self.data["discs"][discid]["group"] = serde_json::json!(g);
            }
            _ => {
                if let Some(obj) = self.data["discs"][discid].as_object_mut() {
                    obj.remove("group");
                    obj.remove("discLabel");
                }
            }
        }
        self.save();
    }
}
