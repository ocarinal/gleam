# Gleam

**English** | [简体中文](README.zh.md)

A physical CD player for the Linux desktop, built with Tauri 2, React and libmpv.

Insert a CD and Gleam reads its TOC, looks up the release on MusicBrainz, then fetches cover art, album information and lyrics. Recognized discs are kept in a local library, so the next insertion is instant. Playback runs inside the app through libmpv — no separate player window.

**Latest release:** [v0.2.1](https://github.com/ocarinal/gleam/releases/tag/v0.2.1) · [Changelog](CHANGELOG.md)

## Screenshots

### Home

![Home](docs/screenshots/home.png)

### Now playing

Synced, word-by-word lyrics with translations, plus a transparent glass control bar.

![Now playing](docs/screenshots/now-playing.png)

### Local library

Album cards, cover art, and manual / artist / release-date sorting.

![Library](docs/screenshots/library.png)

### Album information

MusicBrainz release data with album and artist descriptions from NetEase Cloud Music / QQ Music.

![Album information](docs/screenshots/album-info.png)

## Features

### CD playback

- Reads the TOC immediately with Linux ioctl, tracks show up before the network lookup finishes
- Plays through libmpv linked in-process — no external mpv process
- Play / pause / resume, seek, volume
- Previous / next track, shuffle, repeat one / repeat all
- Play queue panel with drag-to-reorder and right-click “Play next”
- Queue order is used for next/previous and track-boundary switches
- Auto-advance between tracks

### Disc identification

- MusicBrainz DiscID lookup, cached locally after the first match
- When the DiscID is not in MusicBrainz:
  - reads MCN barcode and per-track ISRCs through `cd-info`
  - tries MusicBrainz barcode search first
  - then resolves ISRC → recording → releases, matching the track count
- Live identification HUD showing: TOC → DiscID → MCN / ISRC → release matching
- “Retry matching” on the unidentified screen
- “Search album” from the home screen or album page
- Clear failure reasons on screen
- One-click DiscID submission to MusicBrainz

### Local disc library

- Automatically saves recognized discs and their MusicBrainz release
- Local JSON storage; repeat insertions do not re-query the network
- Edit album title / artist
- Upload, replace or refresh cover art
- Remove entries or a whole disc set
- **Multi-disc sets:** group A/B/C/D discs under one album card
  - one cover in the grid, click to open the full disc list
  - add the next disc from the context menu
  - grouping survives reinsertion of the same disc
- Sorting: manual drag order, artist, release date (newest first)

### Lyrics

Sources:

- LRCLIB
- NetEase Cloud Music
- QQ Music
- Kugou Music

Priority: **bilingual word-timed → bilingual → word-timed → plain synced**.

- Right-click lyrics to switch the lyric source; the choice is remembered
- Synced scrolling, click a line to seek
- Word-by-word highlighting for enhanced LRC / KRC sources
- Translation lines
- Long lyrics automatically reduce type size and improve line wrapping
- Manual lookup with custom title/artist; successful results are saved locally
- Source-specific fetch and local manual cache

### Album information

- MusicBrainz release metadata
- Album description and artist bio/avatar on the right
- Additional information from NetEase Cloud Music and QQ Music
- “Search album” re-match for the current DiscID
- Unknown-disc page with centered diagnostics and actions

### Interface

- Home: cover on the left, track list on the right
- Now playing: lyrics on the left, cover on the right
- Shared-element cover transition from home to now playing
- Transparent, thin-outline bottom control bar; hover to reveal controls
- Bundled **Huixin** font used by default
- 115% default UI scale, responsive fullscreen layout
- Ambient background derived from the current cover

## Tech stack

| Part | Tech |
|---|---|
| Desktop shell | Tauri 2 / Rust |
| Frontend | React + TypeScript + Vite |
| Playback | libmpv (in-process FFI) |
| CD reading | Linux ioctl |
| DiscID | Own MusicBrainz DiscID implementation |
| Album metadata | MusicBrainz API |
| Album / artist descriptions | NetEase Cloud Music, QQ Music |
| Lyrics | LRCLIB, NetEase Cloud Music, QQ Music, Kugou Music |
| Cover art | Cover Art Archive, NetEase Cloud Music |
| Storage | Local JSON + cache |

## Getting started

Gleam is **Linux only** for now. CD reading uses Linux ioctl interfaces; Windows and macOS are not supported.

### 1. Install dependencies

Package names vary by distribution.

**Arch / CachyOS:**

```bash
sudo pacman -S webkit2gtk-4.1 mpv base-devel nodejs npm libcdio
```

**Debian / Ubuntu:**

```bash
sudo apt install build-essential curl wget file libssl-dev \
  libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  libayatana-appindicator3-dev libmpv2 mpv libcdio-utils nodejs npm
```

Required: `libmpv` and `webkit2gtk-4.1`.
Optional: `cd-info` (from `libcdio` / `libcdio-utils`) is used for MCN/ISRC fallback identification. Without it, Gleam falls back to DiscID + manual search.

### 2. Install Rust and Node.js

Rust via rustup:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Node.js 18 or newer.

### 3. Clone and run

```bash
git clone https://github.com/ocarinal/gleam.git
cd gleam
npm install
npm run tauri dev
```

Release build:

```bash
npm run tauri build
./src-tauri/target/release/sounddisc
```

`.deb` / `.rpm` packages are produced by the default bundle targets. For an AppImage, install `fuse2`.

### 4. First-run notes

**No permission to read the drive**

```bash
sudo usermod -aG optical $USER
```

Log out and back in.

**Network proxy**

All MusicBrainz, lyric and cover requests honour standard proxy variables:

```bash
https_proxy=http://127.0.0.1:7890 npm run tauri dev
```

**A disc with no metadata**

Some self-burned or unregistered discs have no DiscID match, no MCN, no ISRC and no CD-TEXT. Gleam shows the reason and offers manual album search / DiscID submission; automatic matching is not possible for such discs.

## Limitations

- Linux only.
- Lyrics and some cover/description sources are unofficial web APIs; availability can change. Use them for personal use and respect each service's terms.
- Cover art may be wrong when a streaming service maps a single to a different album; use “Refresh cover” / upload a local cover if needed.
- `cd-info` fallback is Linux-specific.

## License

MIT. Metadata, lyrics and cover art come from [MusicBrainz](https://musicbrainz.org), [LRCLIB](https://lrclib.net), NetEase Cloud Music, QQ Music and Kugou Music. Please respect their terms of service.
