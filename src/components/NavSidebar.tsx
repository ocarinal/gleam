function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      className={"nb-logo-svg" + (className ? ` ${className}` : "")}
      viewBox="0 0 110 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="4.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M62 28 A32 32 0 1 0 67 75" />
      <path d="M54 64 L67 75" />
      <circle cx="44" cy="55" r="11.5" />
      <circle cx="44" cy="55" r="2.6" fill="currentColor" stroke="none" />
      <path d="M73 76 V23 C73 18 77 15 83 15" />
      <path d="M92 34 C94 43 96 45 103 47 C96 49 94 51 92 60 C90 51 88 49 81 47 C88 45 90 43 92 34 Z" />
    </svg>
  );
}

function NavIcon({ kind }: { kind: "home" | "playing" | "info" | "library" | "settings" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (kind === "home") {
    return (
      <svg {...common}>
        <path d="M4 10.5 12 4l8 6.5" />
        <path d="M6.5 9.5V20h11V9.5" />
        <path d="M10 20v-5h4v5" />
      </svg>
    );
  }
  if (kind === "playing") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m10 8.8 5 3.2-5 3.2z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === "info") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 10.5V17" />
        <circle cx="12" cy="7.6" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === "library") {
    return (
      <svg {...common}>
        <path d="M9 17V6.5l9-2v10" />
        <circle cx="6.8" cy="17" r="2.4" />
        <circle cx="15.8" cy="14.5" r="2.4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 7h8M16 7h4M4 12h3M11 12h9M4 17h9M17 17h3" />
      <circle cx="14" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="15" cy="17" r="2" />
    </svg>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: "home" | "playing" | "info" | "library" | "settings";
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={"nav-item" + (active ? " active" : "")}
      onClick={(e) => {
        // 鼠标切页后清除焦点, 避免 WebKit 留下焦点残影/蓝点
        if (e.detail > 0) e.currentTarget.blur();
        onClick();
      }}
      title={label}
      aria-label={label}
      role="button"
    >
      <span className="nav-icon"><NavIcon kind={icon} /></span>
      <span className="nav-label">{label}</span>
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
  collapsed,
  onExpand,
  onCollapse,
  onHoverEnter,
  onHoverLeave,
  view,
  device,
  disc,
  discTitle,
  discYear,
  discArtist,
  nowTitle,
  nowArtist,
  driveState,
  hasPlaying,
  onNav,
  onOpenPlaying,
}: {
  collapsed: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  view: string;
  device: string | null;
  disc: import("../api").TocInfo | null;
  discTitle: string | null;
  discYear: string | null;
  discArtist: string | null;
  nowTitle: string | null;
  nowArtist: string | null;
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
    <aside
      className="navside"
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      onMouseMove={() => {
        if (collapsed) onHoverEnter();
      }}
    >
      <div className="navside-brand">
        <div className="nav-brand-row">
          <div className="nb-title">
            <span className="nb-wordmark">Gleam</span>
            <button
              className="nb-mark"
              onClick={onExpand}
              title="展开侧边栏"
              aria-label="展开侧边栏"
              aria-expanded={false}
            >
              <span className="nb-mark-g">
                <LogoMark className="nb-mark-img" />
              </span>
              <span className="nb-mark-arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </span>
            </button>
          </div>
          {!collapsed && (
            <button
              className="nav-brand-collapse"
              onClick={onCollapse}
              title="收起侧边栏"
              aria-label="收起侧边栏"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          )}
        </div>
        <div
          className="nb-sub"
          title={nowTitle ? `${nowTitle}${nowArtist ? ` - ${nowArtist}` : ""}` : undefined}
        >
          {nowTitle
            ? `正在播放：${nowTitle}${nowArtist ? ` - ${nowArtist}` : ""}`
            : hasPlaying
            ? "正在播放"
            : "CD播放器"}
        </div>
        <div className="nb-slogan">东半球最好的实体CD播放程序</div>
      </div>

      <nav className="navside-menu">
        <NavItem icon="home" label="首页" active={view === "home"} onClick={() => onNav("home")} />
        <NavItem icon="playing" label="正在播放" active={view === "playing"} onClick={() => onNav("playing")} />
        <NavItem icon="info" label="专辑信息" active={view === "info"} onClick={() => onNav("info")} />
        <NavItem icon="library" label="光盘库" active={view === "library"} onClick={() => onNav("library")} />
        <NavItem icon="settings" label="设置" active={view === "settings"} onClick={() => onNav("settings")} />
      </nav>

      <div className="navside-drive">
        {disc && (
          <div className="side-meta side-meta-clear">
            <div className="dm-now-label">当前CD</div>
            <Marquee text={discTitle ?? "音频 CD"} />
            <div className="dm-artist" title={discArtist ?? undefined}>
              {discArtist || "未知艺人"}
            </div>
            <div className="dm-sub">
              {disc.trackCount} 首歌曲 {total(disc)}
              {discYear ? ` · ${discYear}` : ""}
            </div>
          </div>
        )}
        <div className="drive-row">
          <span className="drive-name">{device ?? "未检测到光驱"}</span>
          <span className="drive-status">
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
