import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LyricSource, Progress } from "../api";
import type { LrcLine } from "../lrc";
import { LyricsInline } from "./LyricsInline";
import { PlayControlBar } from "./PlayControlBar";

const LYRIC_SOURCES: { id: LyricSource; label: string }[] = [
  { id: "auto", label: "自动（最佳匹配）" },
  { id: "lrclib", label: "LRCLIB" },
  { id: "netease", label: "网易云音乐" },
  { id: "qq", label: "QQ 音乐" },
  { id: "kugou", label: "酷狗音乐" },
];

function LyricSourceMenu({
  x,
  y,
  current,
  onPick,
  onManual,
  onClose,
}: {
  x: number;
  y: number;
  current: LyricSource;
  onPick: (s: LyricSource) => void;
  onManual: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const close = () => onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", close, true);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 10;
    setPos({
      x: Math.max(pad, Math.min(x, window.innerWidth - r.width - pad)),
      y: Math.max(pad, Math.min(y, window.innerHeight - r.height - pad)),
    });
  }, [x, y]);

  return createPortal(
    <div
      ref={ref}
      className="lyric-source-menu"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="lsm-head">歌词源</div>
      {LYRIC_SOURCES.map((s) => (
        <button
          key={s.id}
          className={"lsm-item" + (current === s.id ? " on" : "")}
          onClick={() => onPick(s.id)}
        >
          <span>{s.label}</span>
          <span className="lsm-check">{current === s.id ? "✓" : ""}</span>
        </button>
      ))}
      <button
        className="lsm-item lsm-manual"
        onClick={() => {
          onClose();
          onManual();
        }}
      >
        <span>⌕ 手动查找歌词…</span>
      </button>
      <div className="lsm-foot">右键歌词可随时切换</div>
    </div>,
    document.body
  );
}

export function PlayerStage({
  cover,
  title,
  artist,
  album,
  playing,
  progress,
  lyrics,
  lyricsSource,
  lyricsOnly,
  instrumental = false,
  onPrev,
  onTogglePause,
  onNext,
  onSeek,
  canPlay,
  onCoverClick,
  onExitOnly,
  onRetryLyrics,
  lyricSourceMode,
  onPickLyricSource,
  onManualLyrics,
  panelVisible,
  chromeVisible,
  onTogglePanel,
}: {
  cover: string | null;
  title: string;
  artist: string;
  album: string | null;
  playing: boolean;
  progress: Progress | null;
  lyrics: LrcLine[];
  lyricsSource: string;
  lyricsOnly: boolean;
  instrumental?: boolean;
  onPrev: () => void;
  onTogglePause: () => void;
  onNext: () => void;
  onSeek: (secs: number) => void;
  canPlay: boolean;
  onCoverClick: (rect?: { x: number; y: number; w: number; h: number }) => void;
  onExitOnly: () => void;
  onRetryLyrics: () => void;
  lyricSourceMode: LyricSource;
  onPickLyricSource: (s: LyricSource) => void;
  onManualLyrics: () => void;
  panelVisible: boolean;
  chromeVisible: boolean;
  onTogglePanel: () => void;
}) {
  const paused = !playing || (progress?.paused ?? true);
  const [lyricMenu, setLyricMenu] = useState<{ x: number; y: number } | null>(null);

  const openLyricMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setLyricMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className={"stage" + (lyricsOnly ? " lyrics-only" : "")}>
      {lyricsOnly && (
        <div className="ly-backdrop" onClick={onExitOnly} title="点击返回封面" />
      )}

      {lyricsOnly ? (
        <div className="stage-main stage-main-only">
          <div className="stage-lyrics">
            <LyricsInline
              lines={lyrics}
              time={progress?.time ?? 0}
              source={lyricsSource}
              onSeek={(t) => onSeek(t + (progress?.start ?? 0))}
              onRetry={onRetryLyrics}
              idle={playing ? undefined : `当前CD · ${title}`}
              instrumental={instrumental}
              paused={paused}
              onContextMenu={openLyricMenu}
              onManualSearch={onManualLyrics}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="stage-main">
            <div className="stage-meta">
              {artist ? <div className="stage-kicker">{artist}</div> : null}
              <div className="stage-song">{title}</div>
              {album && album !== title ? <div className="stage-album">{album}</div> : null}
            </div>

            <div className="stage-lyrics">
                <LyricsInline
                  lines={lyrics}
                  time={progress?.time ?? 0}
                  source={lyricsSource}
                  onSeek={(t) => onSeek(t + (progress?.start ?? 0))}
                  onRetry={onRetryLyrics}
                  idle={playing ? undefined : `当前CD · ${title}`}
                  instrumental={instrumental}
                  paused={paused}
                  onContextMenu={openLyricMenu}
                  onManualSearch={onManualLyrics}
                />
              </div>

          </div>

          <div
            className="stage-art"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onCoverClick({
                x: r.left,
                y: r.top,
                w: r.width,
                h: r.height,
              });
            }}
            title="点击查看专辑信息"
          >
            <div className="stage-cd">
              {cover ? (
                <img key={cover} className="cdcase cover-vt" src={cover} alt="" />
              ) : (
                <div className="cdcase cdcase-empty cover-vt">♫</div>
              )}
            </div>
          </div>

          <div
            className={"stage-dock" + (chromeVisible ? "" : " chrome-hidden")}
          >
            <PlayControlBar
              title={title}
              playing={playing}
              progress={progress}
              canPlay={canPlay}
              panelVisible={panelVisible}
              onPrev={onPrev}
              onTogglePause={onTogglePause}
              onNext={onNext}
              onSeek={onSeek}
              onTogglePanel={onTogglePanel}
            />
          </div>
        </>
      )}

      {lyricsOnly && (
        <button className="ly-back" onClick={onExitOnly} title="返回封面">
          ✕
        </button>
      )}

      {lyricMenu && (
        <LyricSourceMenu
          x={lyricMenu.x}
          y={lyricMenu.y}
          current={lyricSourceMode}
          onPick={(s) => {
            setLyricMenu(null);
            onPickLyricSource(s);
          }}
          onManual={onManualLyrics}
          onClose={() => setLyricMenu(null)}
        />
      )}
    </div>
  );
}
