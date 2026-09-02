import type { Progress } from "../api";
import type { LrcLine } from "../lrc";
import { LyricsInline } from "./LyricsInline";

const fmtC = (s: number) => {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};


/** 单色 SVG 图标 (描边, 避免字体缺字形) */
const ShuffleIcon = () => (
  <svg width="17" height="16" viewBox="0 0 24 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5h2.2c1.7 0 3.2.8 4.1 2.2l5.4 8c.9 1.3 2.4 2.2 4.1 2.2H21" />
    <path d="M3 16h2.2c1.7 0 3.2-.9 4.1-2.2" />
    <path d="M21 5h-2.2c-1.7 0-3.2.9-4.1 2.2l-5.4 8" />
    <polyline points="18.5 2 21.5 5 18.5 8" />
    <polyline points="18.5 13 21.5 16 18.5 19" />
  </svg>
);

const RepeatIcon = ({ one }: { one?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 2.5l3 3-3 3" />
    <path d="M3 11V9.5A4.5 4.5 0 0 1 7.5 5H20" />
    <path d="M7 19.5l-3-3 3-3" />
    <path d="M21 11v1.5A4.5 4.5 0 0 1 16.5 17H4" />
    {one ? <circle cx="12" cy="11" r="2.4" /> : null}
  </svg>
);

export function PlayerStage({
  cover,
  title,
  artist,
  playing,
  progress,
  lyrics,
  lyricsSource,
  lyricsOnly,
  onPrev,
  onTogglePause,
  onNext,
  onSeek,
  canPlay,
  onCoverClick,
  onExitOnly,
  lyricsOn,
  onRetryLyrics,
  shuffle,
  repeat,
  onToggleShuffle,
  onCycleRepeat,
}: {
  cover: string | null;
  title: string;
  artist: string;
  playing: boolean;
  progress: Progress | null;
  lyrics: LrcLine[];
  lyricsSource: string;
  lyricsOnly: boolean;
  onPrev: () => void;
  onTogglePause: () => void;
  onNext: () => void;
  onSeek: (secs: number) => void;
  canPlay: boolean;
  onCoverClick: () => void;
  onExitOnly: () => void;
  lyricsOn: boolean;
  onRetryLyrics: () => void;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
}) {
  const pct = progress && progress.duration > 0 ? (progress.time / progress.duration) * 100 : 0;
  return (
    <div className={"stage" + (lyricsOnly ? " lyrics-only" : "")}>
      {!lyricsOnly && (
        <div className="stage-left">
          <div
            className="cdart stage-cd"
            onClick={onCoverClick}
            title={lyrics.length > 0 ? "点击切换歌词" : undefined}
          >
            {cover ? (
              <img key={cover} className="cdcase" src={cover} alt="" />
            ) : (
              <div className="cdcase cdcase-empty">♫</div>
            )}
          </div>

          <div className="stage-title">{title}</div>
          <div className="stage-artist">{artist}</div>

          <div className="stage-progress-row">
            <span className="sp-time">{progress ? fmtC(progress.time) : "0:00"}</span>
            <div
              className="pb-progress sp-bar"
              onClick={(e) => {
                if (!progress) return;
                const r = e.currentTarget.getBoundingClientRect();
                const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
                onSeek(progress.start + p * progress.duration);
              }}
            >
              <div className="pb-progress-fill" style={{ width: `${pct}%` }} />
              <div className="pb-progress-knob" style={{ left: `${pct}%` }} />
            </div>
            <span className="sp-time">
              {progress ? `-${fmtC(Math.max(0, progress.duration - progress.time))}` : "--:--"}
            </span>
          </div>

          <div className="stage-mini-ctl">
            <button
              className={"smc" + (shuffle ? " on" : "")}
              onClick={onToggleShuffle}
              title="随机播放"
            >
              <ShuffleIcon />
            </button>
            <button className="smc" onClick={onPrev} disabled={!playing} title="上一首">
              ⏮
            </button>
            <button
              className="smc-play"
              onClick={onTogglePause}
              disabled={!canPlay}
              title={playing ? "播放/暂停" : "播放第 1 首"}
            >
              {playing ? (progress?.paused ? "▶" : "⏸") : "▶"}
            </button>
            <button className="smc" onClick={onNext} disabled={!playing} title="下一首">
              ⏭
            </button>
            <button
              className={"smc" + (repeat !== "off" ? " on" : "")}
              onClick={onCycleRepeat}
              title="循环: 关 / 全部 / 单曲"
            >
              <RepeatIcon one={repeat === "one"} />
            </button>
          </div>
        </div>
      )}

      {lyricsOn && (
      <div className="stage-lyrics">
        <LyricsInline
          lines={lyrics}
          time={progress?.time ?? 0}
          source={lyricsSource}
          onSeek={(t) => onSeek(t + (progress?.start ?? 0))}
          onRetry={onRetryLyrics}
          idle={playing ? undefined : `当前CD · ${title}`}
        />
      </div>
      )}

      {lyricsOnly && (
        <>
          <div className="ly-backdrop" onClick={onExitOnly} title="点击返回封面" />
          <button className="ly-back" onClick={onExitOnly} title="返回封面">
            ✕
          </button>
        </>
      )}
    </div>
  );
}
