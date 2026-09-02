function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div className={"nav-item" + (active ? " active" : "")} onClick={onClick}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

/** 超长标题跑马灯 (缓慢滚动) */
function Marquee({ text }: { text: string }) {
  if (text.length <= 16) {
    return <div className="dm-title">{text}</div>;
  }
  return (
    <div className="dm-title marquee">
      <span className="marquee-track">
        <span>{text}</span>
        <span className="marquee-sep">···</span>
        <span>{text}</span>
      </span>
    </div>
  );
}

export function NavSidebar({
  view,
  device,
  disc,
  discTitle,
  discYear,
  driveState,
  hasPlaying,
  onNav,
  onOpenPlaying,
}: {
  view: string;
  device: string | null;
  disc: import("../api").TocInfo | null;
  discTitle: string | null;
  discYear: string | null;
  driveState: "disc" | "empty" | "unknown" | null;
  hasPlaying: boolean;
  onNav: (v: any) => void;
  onOpenPlaying: () => void;
}) {
  const total = (d: import("../api").TocInfo) => {
    const secs = d.tracks.reduce((a, t) => a + t.durationMs, 0) / 1000;
    const hh = Math.floor(secs / 3600);
    const mm = Math.floor((secs % 3600) / 60);
    const ss = Math.floor(secs % 60);
    return hh > 0
      ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
      : `${mm}:${String(ss).padStart(2, "0")}`;
  };

  return (
    <aside className="navside">
      <div className="navside-brand">
        <div className="nb-title">Gleam</div>
        <div className="nb-sub">{hasPlaying ? "正在播放 CD" : "音乐光盘"}</div>
        <div className="nb-slogan">东半球最好的实体CD播放程序</div>
      </div>

      <nav className="navside-menu">
        <NavItem icon="▤" label="正在播放" active={view === "playing"} onClick={() => onNav("playing")} />
        <NavItem icon="ⓘ" label="专辑信息" active={view === "info"} onClick={() => onNav("info")} />
        <NavItem icon="≡" label="播放队列" active={view === "queue"} onClick={() => onNav("queue")} />
        <NavItem icon="♫" label="光盘库" active={view === "library"} onClick={() => onNav("library")} />
        <NavItem icon="⚙" label="设置" active={view === "settings"} onClick={() => onNav("settings")} />
      </nav>

      <div className="navside-drive">
        {disc && (
          <div className="side-meta">
            <Marquee text={discTitle ?? "音频 CD"} />
            <div className="dm-sub">
              {disc.trackCount} 音歌曲 {total(disc)}
              {discYear ? ` · ${discYear}` : ""}
            </div>
          </div>
        )}
        <div className="drive-row">
          <span className="drive-name">{device ?? "未检测到光驱"}</span>
          <span className="drive-status">
            <span className={"drive-dot" + (driveState === "disc" ? " on" : "")} />
            {driveState === "disc"
              ? "光盘已就绪"
              : driveState === "empty"
              ? "未检测到光盘"
              : "状态未知"}
          </span>
        </div>
      </div>
    </aside>
  );
}
