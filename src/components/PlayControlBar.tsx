import { useEffect, useRef, useState } from "react";
import type { Progress } from "../api";

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) return "00:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
    <path d="M8 5.2v13.6L19 12z" fill="currentColor" />
  </svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
    <rect x="7" y="5" width="3.4" height="14" rx="1.4" fill="currentColor" />
    <rect x="13.6" y="5" width="3.4" height="14" rx="1.4" fill="currentColor" />
  </svg>
);
const PrevIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 5v14L8 12z" fill="currentColor" stroke="none" />
    <path d="M6 5v14" />
  </svg>
);
const NextIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 5v14l10-7z" fill="currentColor" stroke="none" />
    <path d="M18 5v14" />
  </svg>
);
const QueueIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M4 6.5h11M4 12h11M4 17.5h7" />
    <path d="M18.5 14.5v5l3.5-2.5z" fill="currentColor" stroke="none" />
  </svg>
);

export function PlayControlBar({
  title,
  playing,
  progress,
  canPlay,
  panelVisible,
  onPrev,
  onTogglePause,
  onNext,
  onSeek,
  onTogglePanel,
}: {
  title: string;
  playing: boolean;
  progress: Progress | null;
  canPlay: boolean;
  panelVisible: boolean;
  onPrev: () => void;
  onTogglePause: () => void;
  onNext: () => void;
  onSeek: (secs: number) => void;
  onTogglePanel: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [nexting, setNexting] = useState(false);
  const nextTimer = useRef<number | null>(null);

  const paused = !playing || (progress?.paused ?? true);
  const active = playing && !paused;
  const pct = progress && progress.duration > 0 ? (progress.time / progress.duration) * 100 : 0;
  // 完全跟随鼠标: 不悬浮只留进度，悬浮才展开控件。
  const compact = !hovered;

  useEffect(() => () => {
    if (nextTimer.current) window.clearTimeout(nextTimer.current);
  }, []);

  const flashNext = () => {
    setNexting(true);
    if (nextTimer.current) window.clearTimeout(nextTimer.current);
    nextTimer.current = window.setTimeout(() => setNexting(false), 520);
  };

  const seekAt = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progress) return;
    const r = e.currentTarget.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    onSeek(progress.start + p * progress.duration);
  };

  return (
    <div
      className={
        "pc-bar" +
        (compact ? " compact" : "") +
        (active ? " playing" : "") +
        (nexting ? " nexting" : "")
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="group"
      aria-label="播放控制"
    >
      <div className="pc-orb-group">
        <button
          className="pc-side pc-prev"
          onClick={onPrev}
          disabled={!playing}
          title="上一首"
          aria-label="上一首"
        >
          <PrevIcon />
        </button>
        <button
          className="pc-play"
          onClick={onTogglePause}
          disabled={!canPlay}
          title={playing ? (paused ? "继续播放" : "暂停") : "播放"}
          aria-label={playing ? (paused ? "继续播放" : "暂停") : "播放"}
        >
          <span className="pc-play-icon">{active ? <PauseIcon /> : <PlayIcon />}</span>
        </button>
        <button
          className="pc-side pc-next"
          onClick={() => {
            flashNext();
            onNext();
          }}
          disabled={!playing}
          title="下一首"
          aria-label="下一首"
        >
          <NextIcon />
        </button>
      </div>

      <div className="pc-middle">
        <div className="pc-title" key={title}>
          {title || "—"}
        </div>
        <div className="pc-progress-row">
          <span className="pc-time">{progress ? fmt(progress.time) : "00:00"}</span>
          <div className="pc-progress" onClick={seekAt} title="点击跳转">
            <div className="pc-fill" style={{ width: `${pct}%` }} />
            <div className="pc-knob" style={{ left: `${pct}%` }} />
          </div>
          <span className="pc-time">{progress ? fmt(progress.duration) : "--:--"}</span>
        </div>
      </div>

      <div className="pc-tools">
        <button
          className={"pc-tool" + (panelVisible ? " on" : "")}
          onClick={onTogglePanel}
          title="播放队列"
          aria-label="播放队列"
        >
          <QueueIcon />
        </button>
      </div>
    </div>
  );
}
