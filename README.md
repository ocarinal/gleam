# Gleam

一款给 Linux 桌面用的实体 CD 播放器。

Gleam 是一个基于 Tauri 2、React 和 libmpv 开发的本地 CD 播放器。

插入 CD 后，程序会读取光盘的 TOC，根据 DiscID 从 MusicBrainz 获取专辑信息，再获取封面和歌词。识别完成后，专辑会保存到本地收藏库，之后再次插入同一张 CD 就可以直接使用之前保存的信息。

播放使用 libmpv，直接集成在程序里，不需要另外打开 mpv 或其他播放器。

## 📸 界面预览

**播放页 · 同步歌词**

歌词来自 LRCLIB，支持同步滚动和点击歌词跳转。

![播放页-同步歌词](docs/screenshots/playing-lyrics.png)

**播放页 · 曲目列表**

插入 CD 后会先读取 TOC，因此不需要等网络识别完成就能看到光盘中的曲目。

![播放页-曲目列表](docs/screenshots/playing-tracklist.png)

## ✨ 功能

### 💿 CD 播放

- 插入 CD 后直接读取 TOC，快速显示曲目
- 使用 Linux ioctl 读取光盘信息
- 使用 libmpv 播放，不启动额外的播放器进程
- 支持播放、暂停、继续、进度调整和音量控制
- 上一首 / 下一首
- 随机播放
- 单曲循环 / 全部循环
- 自动播放下一首
- 播放页面显示专辑封面、曲目列表和同步歌词
- 根据专辑封面生成背景光效

### 🔍 专辑识别

- 使用 MusicBrainz DiscID 识别 CD
- DiscID 识别失败时，可以通过艺术家和专辑名进行搜索
- 可以直接将当前 CD 的 DiscID 提交到 MusicBrainz
- 支持通过 Barcode 辅助确认具体发行版本

### 📚 光盘收藏库

识别成功的 CD 会自动保存到本地收藏库。

收藏库保存的是本地数据，不需要每次打开程序都重新查询网络。

支持：

- 保存 CD 与 MusicBrainz 专辑的对应关系
- 修改专辑名称和艺术家
- 本地上传或更换封面
- 重新获取封面
- 删除收藏
- 双碟专辑分别记录 Disc 1 / Disc 2

收藏卡片支持简单的悬停和播放动画，点击专辑可以查看对应的 MusicBrainz 页面。

### 🎤 歌词

歌词目前使用两个来源：

- LRCLIB
- 网易云音乐

LRCLIB 会优先根据歌曲名称、时长等信息进行匹配。找不到时再尝试网易云。

支持：

- 同步歌词
- 当前歌词自动高亮
- 点击歌词跳转到对应位置
- 翻译歌词
- 手动重新搜索
- 歌词缓存

为了避免错误匹配，歌词会进行额外的信息校验，而不是只根据歌曲名称搜索。

### 🎨 外观设置

目前提供一些比较基础的个性化选项：

- 应用字体
- 软件字号
- 强调色
- 背景光效开关

界面整体采用深色、毛玻璃和比较克制的动画效果。

## 🛠 技术栈

| 部分 | 技术 |
|---|---|
| 桌面框架 | Tauri 2 / Rust |
| 前端 | React + TypeScript + Vite |
| 播放 | libmpv |
| CD 读取 | Linux ioctl |
| DiscID | 自己实现的 MusicBrainz DiscID 算法 |
| 专辑信息 | MusicBrainz API |
| 歌词 | LRCLIB / 网易云音乐 |
| 封面 | Cover Art Archive / 网易云 CDN |
| 数据存储 | 本地缓存 |

### 关于 DiscID

DiscID 的计算按照 MusicBrainz 的算法实现，并使用官方示例进行过校验。

### 关于播放

libmpv 是直接通过 FFI 集成到应用中的，不会额外启动一个 mpv 进程。因此播放和界面都由 Gleam 自己控制。

## 🚀 快速开始

先说一下，Gleam 目前只支持 Linux。

因为读取 CD 用到了 Linux 的 ioctl 接口，所以 Windows 和 macOS 目前没法直接运行。

### 1. 安装依赖

不同发行版的包名不太一样，按照你自己的系统安装即可。

**Arch / CachyOS：**

```bash
sudo pacman -S webkit2gtk-4.1 mpv base-devel nodejs npm
```

**Debian / Ubuntu：**

```bash
sudo apt install build-essential curl wget file libssl-dev \
  libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  libayatana-appindicator3-dev libmpv2 mpv nodejs npm
```

其中 libmpv 和 webkit2gtk-4.1 是必须的。

### 2. 安装 Rust 和 Node.js

Rust 推荐直接使用 rustup：

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Node.js 需要 18 或更高版本。如果系统自带的版本比较旧，可以用 nvm 安装。

### 3. 下载项目

```bash
git clone https://github.com/ocarinal/gleam.git
cd gleam
npm install
```

### 4. 启动

开发环境直接运行：

```bash
npm run tauri dev
```

第一次运行需要编译 Rust 依赖，可能会花几分钟。如果终端一段时间没有输出，一般是在编译，不用急着关掉。

如果想编译正式版本：

```bash
npm run tauri build
```

编译完成后可以直接运行：

```bash
./src-tauri/target/release/sounddisc
```

同时也会生成对应的 .deb / .rpm 安装包。

如果需要 AppImage，需要另外安装 fuse2。

### 5. 第一次使用可能遇到的问题

**光驱没有权限**

如果程序无法读取光盘，可以把当前用户加入 optical 用户组：

```bash
sudo usermod -aG optical $USER
```

然后重新登录系统。

**封面获取失败**

封面主要通过 Cover Art Archive 获取。如果当前网络访问不了，程序会尝试使用网易云的封面源。

**使用代理**

如果你的网络需要代理，可以直接设置环境变量。例如：

```bash
https_proxy=http://127.0.0.1:7890 npm run tauri dev
```

识别、歌词和封面请求都会使用这个代理。

安装完成后插入 CD，Gleam 会自动尝试识别专辑、获取封面和歌词，并将专辑加入收藏库。

## 📄 许可

MIT。元数据/歌词/封面来自 [MusicBrainz](https://musicbrainz.org) / [LRCLIB](https://lrclib.net) / 网易云音乐（仅本地自用，请遵守各服务条款）。
