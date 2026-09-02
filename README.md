# Gleam

> **东半球最好的实体 CD 播放程序** —— 为 Linux 桌面而生，本地优先、元数据联网、光盘即插即放。

Gleam 是一个基于 **Tauri 2 + React + libmpv** 的本地实体 CD 播放器。插上光盘，它读取碟片目录（TOC）、自动识别专辑信息、拉取封面与同步歌词，并直接在应用内播放——**全程无外部播放器窗口、无在线服务依赖，所有数据本地缓存**。

---

## ✨ 功能特性

### 💿 光盘播放
- 插碟即读：TOC 直接读取（ioctl，与 libdiscid 同源），**3 秒内显示全部曲目**，无需等待识别
- **进程内播放**：libmpv 内嵌引擎（无 mpv 子进程/图标），无缝曲目切换、暂停/继续/seek/音量全可控
- 上一首/下一首/随机/循环（全部、单曲）、自动连播
- 播放页 Apple Music 风格：CD 盒封面 + 同步歌词 + 封面光晕动态背景

### 🔍 智能识别
- **MusicBrainz DiscID** 精确识别（SHA-1 自研实现，经官方示例逐字节校验）+ 文字搜索兜底
- 识别失败时可**一键提交 DiscID 到 MusicBrainz**（foobar 式网页流程）
- **压片级验证**：条码（Barcode）自动匹配确认

### 📚 本地光盘收藏库
- 自动收录识别的光盘（DiscID → 专辑映射，**本地缓存永久保存**）
- 收藏页动效卡片：入场错峰、悬停光盘抽出旋转、播放角标、点击直达 MusicBrainz
- **右键编辑**：改专辑名/艺术家（本地覆盖）、上传封面、刷新封面、删除收藏
- **双碟支持**：双碟合辑 A/B 碟片标记，插哪张显示哪张的曲目

### 🎤 歌词（多源自动）
- LRCLIB 优先（精确题名/时长/录音 ID 三重校验）→ 网易云兜底（带日文翻译）
- 同步滚动高亮、点行跳转、翻译副行、未找到一键重查
- 内存 + 负缓存，超时保护（7 秒必出结果），绝不拿错歌的歌词

### 🎨 个性化
- **应用字体**（调用系统全部字体）、**软件字号**（仅放大文字，UI 尺寸不变）、**强调色**（5 色实时换肤）、**背景光效开关**
- 全应用 Apple-style 动效过渡（视图错峰缓入、进度条顺滑、按钮回弹）

---

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Tauri 2 (Rust) · 无边框沉浸窗口 |
| 播放引擎 | **libmpv in-process**（FFI 直连，无子进程） |
| 光盘读取 | Linux ioctl（CDROMREADTOCHDR/TOCENTRY）+ 自研 DiscID 算法 |
| 元数据 | MusicBrainz API（1 req/s 限速、503 重试、本地缓存库） |
| 歌词 | LRCLIB（首选，精准校验）→ 网易云音乐（备用，带翻译） |
| 封面 | 本地缓存 → Cover Art Archive → 网易云 CDN（魔数识别格式，最新优先） |
| 前端 | React + TypeScript + Vite（毛玻璃/Apple 风格深色 UI） |

---

## 🚀 构建与运行

### 依赖（Arch / CachyOS）
```bash
sudo pacman -S webkit2gtk-4.1 mpv base-devel nodejs npm
```

### 开发模式
```bash
npm install
npm run tauri dev
```

### 打包
```bash
npm run tauri build
# 产物: target/release/sounddisc (自包含二进制)
#       target/release/bundle/deb|rpm
```
> AppImage 打包需 `sudo pacman -S fuse2`（linuxdeploy 依赖）。

### 直接运行（推荐 Arch 用户）
```bash
./src-tauri/target/release/sounddisc
```

---

## 📂 项目结构

```
cdplayer/
├── crates/cd-core/        # 纯逻辑库 (无 GUI 依赖)
│   └── src/
│       ├── discid.rs      # DiscID 计算 (含官方示例单测)
│       ├── toc.rs         # ioctl 读 TOC / 托盘状态 / 弹出
│       ├── player.rs      # libmpv FFI (加载/播放/进度/事件)
│       ├── library.rs     # 本地光盘集缓存 (library.json)
│       ├── mb.rs          # MusicBrainz 客户端
│       ├── lrclib.rs      # LRCLIB 歌词
│       ├── netease.rs     # 网易云歌词/封面
│       └── cover.rs       # 封面多源 (缓存→CAA→网易云)
├── src-tauri/             # Tauri 壳 (命令层, 事件转发)
└── src/                   # React 前端
    ├── App.tsx            # 状态机: 检测→识别→播放→收藏
    └── components/        # 舞台/歌词/曲目面板/设置/光盘库...
```

---

## 🗃 数据与缓存

| 路径 | 内容 |
|---|---|
| `~/.cache/sounddisc/library.json` | 光盘集：DiscID → 专辑（含 A/B 碟、本地改名） |
| `~/.cache/sounddisc/covers/` | 封面包（按 release ID 前缀命名，最新优先） |
| `~/.cache/sounddisc/logs/` | mpv/媒体/歌词/封面诊断日志 |

---

## ⚠️ 已知限制

- **DiscID 挂载率**：合辑/引进版/部分日碟在 MusicBrainz 上无 DiscID（识别走搜索确认路径，可提交补全）
- 中文老碟封面在 CAA 覆盖低（网易云 CDN 兜底，本地可手动上传覆盖）
- 光驱为 USB 桥接的设备：托盘弹出后请勿立刻发设备命令（部分固件会自动合拢，程序已做零命令规避）

## 🗺 路线图

- [ ] AppImage 打包链路修复（fuse2）
- [ ] 逐轨本地改名（当前支持专辑级）
- [ ] 播放队列拖拽排序
- [ ] 网易云封面批量回填收藏库
- [ ] 音质显示 / ReplayGain

---

## 📄 许可

MIT。元数据/歌词/封面来自 [MusicBrainz](https://musicbrainz.org) / [LRCLIB](https://lrclib.net) / 网易云音乐（仅本地自用，请遵守各服务条款）。
