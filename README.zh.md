# Gleam

[English](README.md) | **简体中文**

一款给 Linux 桌面用的实体 CD 播放器，基于 Tauri 2、React 和 libmpv。

插入 CD 后，Gleam 会读取光盘 TOC，从 MusicBrainz 获取发行信息，再获取封面、专辑介绍和歌词。识别过的光盘会保存在本地库，下次插入直接使用。播放通过 libmpv 集成在应用内，不会另外打开播放器窗口。

**当前版本：** [v0.2.1](https://github.com/ocarinal/gleam/releases/tag/v0.2.1) · [更新日志](CHANGELOG.md)

## 界面预览

### 首页

![首页](docs/screenshots/home.png)

### 正在播放

支持逐字同步歌词、翻译，以及底部透明播放条。

![正在播放](docs/screenshots/now-playing.png)

### 本地光盘库

专辑卡片、封面，以及手动 / 歌手 / 发行时间排序。

![本地光盘库](docs/screenshots/library.png)

### 专辑信息

MusicBrainz 发行信息，右侧显示来自网易云音乐 / QQ 音乐的专辑介绍和歌手信息。

![专辑信息](docs/screenshots/album-info.png)

## 功能

### CD 播放

- 插入后立即读取 TOC（Linux ioctl），网络识别完成前就能看到曲目
- libmpv 进程内播放，不启动额外的 mpv 进程
- 播放 / 暂停 / 继续、进度跳转、音量
- 上一首 / 下一首、随机播放、单曲循环 / 全部循环
- 播放队列面板：拖动排序、右键“下一首播放”
- 队列顺序用于上一首 / 下一首和曲目边界切换
- 自动连播

### 光盘识别

- MusicBrainz DiscID 识别，首次成功后写入本地库
- DiscID 查不到时自动兜底：
  - 通过 `cd-info` 读取 MCN 条码和每轨 ISRC
  - 先按 MusicBrainz 条码搜索
  - 再按 ISRC → recording → releases 匹配，并校验音轨数
- 顶部识别进度 HUD：读取目录 → DiscID → MCN / ISRC → 匹配发行版
- 未识别页支持“重新匹配”
- 首页和专辑页都提供“搜索专辑”
- 识别失败会显示具体原因
- 一键提交 DiscID 到 MusicBrainz

### 本地光盘库

- 自动保存识别过的光盘和对应的 MusicBrainz 发行版
- 本地 JSON 存储，再次插入不重复查询网络
- 修改专辑名 / 艺术家
- 上传、更换或刷新封面
- 删除单张光盘或整个碟组
- **多碟合集：** A/B/C/D 碟合成一张专辑卡片
  - 库中只显示一张封面，点击查看全部碟片
  - 右键继续增加下一张碟
  - 重新插入同一张碟也不会丢失编组
- 排序：手动拖动、按歌手、按发行时间（新到旧）

### 歌词

来源：

- LRCLIB
- 网易云音乐
- QQ 音乐
- 酷狗音乐

优先级：**双语逐字 → 双语 → 单语逐字 → 单语同步**。

- 右键歌词切换歌词源，选择会记住
- 同步滚动、点击歌词跳转
- 增强 LRC / KRC 支持逐字高亮
- 翻译歌词
- 长歌词自动缩小字号并优化换行
- 手动查找支持自定义歌名 / 歌手，成功后保存到本地
- 指定源获取 + 本地手动缓存

### 专辑信息

- MusicBrainz 发行信息
- 右侧展示专辑介绍、歌手头像和简介
- 数据来自网易云音乐 + QQ 音乐
- 当前 DiscID 支持“搜索专辑”重新匹配
- 未识别页居中显示诊断信息和操作入口

### 界面

- 首页：左侧封面，右侧曲目
- 播放页：左侧歌词，右侧封面
- 首页到播放页的封面共享元素过渡
- 透明细边框底部播放条，悬浮显示控件
- 内置慧心字体并默认使用
- 默认 115% UI 缩放，全屏时按比例适配
- 根据当前封面生成氛围背景

## 技术栈

| 部分 | 技术 |
|---|---|
| 桌面框架 | Tauri 2 / Rust |
| 前端 | React + TypeScript + Vite |
| 播放 | libmpv（进程内 FFI） |
| CD 读取 | Linux ioctl |
| DiscID | 自己实现的 MusicBrainz DiscID 算法 |
| 专辑信息 | MusicBrainz API |
| 专辑 / 歌手介绍 | 网易云音乐、QQ 音乐 |
| 歌词 | LRCLIB、网易云音乐、QQ 音乐、酷狗音乐 |
| 封面 | Cover Art Archive、网易云音乐 |
| 存储 | 本地 JSON + 缓存 |

## 快速开始

目前只支持 **Linux**。读取 CD 使用 Linux ioctl 接口，Windows / macOS 暂不支持。

### 1. 安装依赖

不同发行版包名不同。

**Arch / CachyOS：**

```bash
sudo pacman -S webkit2gtk-4.1 mpv base-devel nodejs npm libcdio
```

**Debian / Ubuntu：**

```bash
sudo apt install build-essential curl wget file libssl-dev \
  libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  libayatana-appindicator3-dev libmpv2 mpv libcdio-utils nodejs npm
```

必须：`libmpv`、`webkit2gtk-4.1`。
可选：`cd-info`（来自 `libcdio` / `libcdio-utils`），用于 MCN / ISRC 兜底识别。未安装时退回 DiscID + 手动搜索。

### 2. 安装 Rust 和 Node.js

Rust 推荐 rustup：

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Node.js 18 或更高版本。

### 3. 克隆并运行

```bash
git clone https://github.com/ocarinal/gleam.git
cd gleam
npm install
npm run tauri dev
```

正式构建：

```bash
npm run tauri build
./src-tauri/target/release/sounddisc
```

默认会生成 `.deb` / `.rpm` 安装包。需要 AppImage 时另外安装 `fuse2`。

### 4. 第一次使用

**光驱没有权限**

```bash
sudo usermod -aG optical $USER
```

重新登录。

**使用代理**

MusicBrainz、歌词和封面请求都会走标准代理环境变量：

```bash
https_proxy=http://127.0.0.1:7890 npm run tauri dev
```

**没有元数据的 CD**

部分自刻盘 / 未收录光盘没有 DiscID、MCN、ISRC 和 CD-TEXT。Gleam 会显示失败原因，并提供手动搜索 / 提交 DiscID；这类光盘无法自动匹配。

## 已知限制

- 仅支持 Linux。
- 歌词和部分封面 / 介绍源是非官方 Web API，随时可能变化；请仅作个人使用并遵守各服务条款。
- 流媒体源可能把单曲错误映射到同组专辑封面；可以用“刷新封面”或手动上传替换。
- `cd-info` 兜底识别仅适用于 Linux。

## 许可

MIT。元数据、歌词和封面来自 [MusicBrainz](https://musicbrainz.org)、[LRCLIB](https://lrclib.net)、网易云音乐、QQ 音乐和酷狗音乐，请遵守各服务条款。
