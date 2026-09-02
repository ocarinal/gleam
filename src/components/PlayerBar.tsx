import type { Progress, Release } from "../api";

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

export function PlayerBar({
  playing,
  release,
  cover,
  progress,
  trackCount,
  status,
  onPrev,
  onTogglePause,
  onNext,
  onStop,
  onSeek,
  onOpenLyrics,
  onRescan,
}: {
  playing: { no: number; title: string } | null;
  release: Release | null;
  cover: string | null;
  progress: Progress | null;
  trackCount: number;
  status: string;
  onPrev: () => void;
  onTogglePause: () => void;
  onNext: () => void;
  onStop: () => void;
  onSeek: (secs: number) => void;
  onOpenLyrics: () => void;
  onRescan: () => void;
}) {
  const pct = progress && progress.duration > 0 ? (progress.time / progress.duration) * 100 : 0;
  const artist = release?.artistCredit?.map((a) => a.name).join(" / ") || "";
  const no = playing?.no ?? 0;
  return (
    <footer className="playerbar">
      <div className="pb-left" onClick={onOpenLyrics} title="显示歌词">
        {cover ? (
          <img className="pb-cover" src={cover} alt="" />
        ) : (
          <div className="pb-cover pb-cover-empty">♫</div>
        )}
        <div className="pb-meta">
          <div className="pb-title">{playing ? `${no}. ${playing.title}` : "未播放"}</div>
          <div className="pb-artist">{status || artist}</div>
        </div>
      </div>

      <div className="pb-center">
        <div className="pb-controls">
          <button
            className="pb-skip"
            onClick={onPrev}
            disabled={!playing || no <= 1}
            title="上一首"
          >
            ⏮
          </button>
          <button
            className="pb-play"
            onClick={onTogglePause}
            disabled={!playing}
            title={progress?.paused ? "播放" : "暂停"}
          >
            {progress?.paused ? "▶" : "⏸"}
          </button>
          <button
            className="pb-skip"
            onClick={onNext}
            disabled={!playing || no >= trackCount}
            title="下一首"
          >
            ⏭
          </button>
        </div>
        <div
          className="pb-progress"
          onClick={(e) => {
            if (!progress) return;
            const r = e.currentTarget.getBoundingClientRect();
            const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
            // seek 用整碟坐标: 曲目起点 + 曲目内时间
            onSeek(progress.start + p * progress.duration);
          }}
        >
          <div className="pb-progress-fill" style={{ width: `${pct}%` }} />
          <div className="pb-progress-knob" style={{ left: `${pct}%` }} />
        </div>
        <div className="pb-row">
          <span className="pb-time">{progress ? fmt(progress.time) : "0:00"}</span>
          <span className="pb-time">
            {progress ? `-${fmt(Math.max(0, progress.duration - progress.time))}` : "--:--"}
          </span>
        </div>
      </div>

      <div className="pb-right">
        <button className="pb-btn" onClick={onRescan} title="重新读盘(换碟后)">
          🔄
        </button>
        <button className="pb-btn" onClick={onStop} disabled={!playing} title="停止">
          ⏹
        </button>
        <button className="pb-btn" onClick={onOpenLyrics} disabled={!playing} title="歌词">
          ♪
        </button>
      </div>
    </footer>
  );
}
