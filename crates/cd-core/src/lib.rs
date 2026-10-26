//! cd-core — CD 识别/播放纯逻辑库 (无 GUI 依赖, 可独立测试)
//! 移植自已验证的 Python 原型 cdprobe.py

pub mod cover;
pub mod discid;
pub mod kugou;
pub mod library;
pub mod lrclib;
pub mod lyrics;
pub mod mb;
pub mod meta;
pub mod netease;
pub mod player;
pub mod qq;
pub mod toc;

pub const USER_AGENT: &str = "SoundDisc/0.1 (local self-use; contact: local user)";
