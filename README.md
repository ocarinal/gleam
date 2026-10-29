# Gleam

**English** | [简体中文](README.zh.md)

A physical CD player for Linux, built with Tauri 2, React and libmpv.

Insert a disc and Gleam reads its TOC, looks up the release on MusicBrainz, then fetches artwork, album information and lyrics. Recognized discs are stored locally, so the next insertion is instant.

**Latest release:** [v1.0.0](https://github.com/ocarinal/gleam/releases/tag/v1.0.0) · [Changelog](CHANGELOG.md)

## Screenshots

![Home](docs/screenshots/home.png)

![Now playing](docs/screenshots/now-playing.png)

![Library](docs/screenshots/library.png)

![Album information](docs/screenshots/album-info.png)

## Features

- **CD playback** — libmpv in-process, TOC, seek, volume, queue, shuffle/repeat.
- **Disc identification** — MusicBrainz DiscID, plus MCN/ISRC fallback when the DiscID is unknown. Live progress, retry, manual search and DiscID submission.
- **Local library** — search, drag sorting, A/B/C/D disc sets, album detail with artwork, descriptions, artist info and track list.
- **Lyrics** — LRCLIB, NetEase, QQ Music and Kugou; source switching, word-timed and translated lyrics, manual lookup and caching.
- **Interface** — cover-derived ambient background, collapsible sidebar, accent color or automatic accent from artwork, bundled Huixin font, 115% UI scaling.
- **Keyboard control** — `Space`, arrow seek, `Ctrl`+arrows, `N/P`, `M`, `S`, `R`, `L`, `Q`, plus media keys.

## Tech stack

| Part | Tech |
|---|---|
| Desktop shell | Tauri 2 / Rust |
| Frontend | React + TypeScript + Vite |
| Playback | libmpv (in-process FFI) |
| CD reading | Linux ioctl |
| Metadata | MusicBrainz |
| Lyrics | LRCLIB / NetEase / QQ Music / Kugou |
| Storage | Local JSON and cache |

## Getting started

Linux only. Required: `libmpv`, `webkit2gtk-4.1`, Rust, Node.js 18+.

**Arch / CachyOS**

```bash
sudo pacman -S webkit2gtk-4.1 mpv base-devel nodejs npm libcdio
```

**Debian / Ubuntu**

```bash
sudo apt install build-essential curl file libssl-dev \
  libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  libayatana-appindicator3-dev libmpv2 mpv libcdio-utils nodejs npm
```

`cd-info` (from `libcdio` / `libcdio-utils`) is optional; it enables barcode/ISRC fallback identification.

```bash
git clone https://github.com/ocarinal/gleam.git
cd gleam
npm install
npm run tauri dev
```

Release build:

```bash
npm run tauri build
```

If the drive is not readable:

```bash
sudo usermod -aG optical $USER
```

Then log out and back in.

## Notes

- Linux only for now; CD access uses Linux ioctl.
- Lyrics and some metadata sources are unofficial web APIs; availability may change. Please respect their terms.
- A disc with no DiscID, MCN, ISRC or CD-TEXT cannot be identified automatically; use manual search or submit the DiscID.

## License

MIT. Metadata, lyrics and artwork belong to their respective providers.
