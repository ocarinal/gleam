import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface TrackInfo {
  no: number;
  durationMs: number;
}

export interface TocInfo {
  device: string;
  trackCount: number;
  discid: string;
  tocString: string;
  tracks: TrackInfo[];
}

export interface ArtistCredit {
  name: string;
}

export interface Track {
  title: string;
  length: number | null;
  artistCredit: ArtistCredit[] | null;
  recording: { id: string | null } | null;
}

export interface Medium {
  format: string | null;
  trackCount: number | null;
  tracks: Track[] | null;
}

export interface Release {
  id: string;
  title: string;
  date: string | null;
  country: string | null;
  status: string | null;
  barcode: string | null;
  disambiguation: string | null;
  artistCredit: ArtistCredit[] | null;
  media: Medium[] | null;
  releaseGroup: { id: string | null } | null;
}

export interface LyricsResult {
  lrc: string;
  tlyric: string | null;
  synced: boolean;
  source: string;
  cover: string | null;
}

export interface Progress {
  time: number;
  duration: number;
  /** 当前曲目在整碟中的起点(秒), seek 时需加回 */
  start: number;
  trackNo: number;
  paused: boolean;
}

export interface LibraryEntry {
  discId: string;
  release: Release;
  savedAt: string;
  medium: number | null;
}

export const detectDisc = () => invoke<TocInfo>("detect_disc");
export const resolveDisc = (discid: string) =>
  invoke<{ release: Release; medium: number } | null>("resolve_disc", { discid });
export const confirmReleaseForDisc = (discid: string, releaseId: string) =>
  invoke<Release>("confirm_release_for_disc", { discid, releaseId });
export const searchReleases = (query: string) =>
  invoke<Release[]>("search_releases", { query });
export const getRelease = (id: string) => invoke<Release>("get_release", { id });
export const openMbSubmit = (tocString: string, releaseId: string | null) =>
  invoke<void>("open_mb_submit", { tocString, releaseId });
export const openMbRelease = (releaseId: string) =>
  invoke<void>("open_mb_release", { releaseId });
export const fetchCover = (
  releaseId: string,
  rgId: string | null,
  title: string,
  artist: string
) => invoke<string | null>("fetch_cover", { releaseId, rgId, title, artist });
export const fetchLyrics = (
  title: string,
  artist: string,
  lengthMs: number | null,
  recordingId: string | null,
  force = false
) => invoke<LyricsResult>("fetch_lyrics", { title, artist, lengthMs, recordingId, force });
export const listLibrary = () => invoke<LibraryEntry[]>("list_library");
export const libraryCover = (releaseId: string, title: string, artist: string) =>
  invoke<string | null>("library_cover", { releaseId, title, artist });
export const libraryUpdate = (discId: string, title: string | null, artist: string | null) =>
  invoke<void>("library_update", { discid: discId, title, artist });
export const libraryRemove = (discId: string) =>
  invoke<void>("library_remove", { discid: discId });
export const librarySetMedium = (discId: string, idx: number) =>
  invoke<void>("library_set_medium", { discid: discId, idx });
export const refreshCover = (releaseId: string, rgId: string | null, title: string, artist: string) =>
  invoke<string | null>("refresh_cover", { releaseId, rgId, title, artist });
export const listFonts = () => invoke<string[]>("list_fonts");
export const playTrack = (device: string, trackNo: number) =>
  invoke<string>("play_track", { device, trackNo });
export const playerPause = (paused: boolean) =>
  invoke<void>("player_pause", { paused });
export const playerSeek = (secs: number) => invoke<void>("player_seek", { secs });
export const playerStop = () => invoke<void>("player_stop");
export const playerVolume = (vol: number) => invoke<void>("player_volume", { vol });
export const ejectDisc = () => invoke<string>("eject_disc");
export const driveScan = () => invoke<{ device: string; state: "disc" | "empty" | "unknown" }>("drive_scan");
export const saveCover = (releaseId: string, dataUrl: string) =>
  invoke<string | null>("save_cover", { releaseId, dataUrl });
export const mediaState = () =>
  invoke<{ tray: "open" | "closed" | "unknown"; size: boolean }>("media_state");

export const onProgress = (cb: (p: Progress) => void) =>
  listen<Progress>("player-progress", (e) => cb(e.payload));
export const onEnded = (cb: () => void) =>
  listen("player-ended", () => cb());
/** 光盘插拔事件 (udev 被动监听) */
export const onDriveMedia = (cb: () => void) =>
  listen("drive-media", () => cb());
