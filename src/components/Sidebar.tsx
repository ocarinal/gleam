export function Sidebar({
  view,
  hasPlaying,
  onNav,
  onOpenPlaying,
}: {
  view: "disc" | "library";
  hasPlaying: boolean;
  onNav: (v: "disc" | "library") => void;
  onOpenPlaying: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand brand-text">SoundDisc</div>
      <nav>
        <div
          className={"nav-item" + (view === "disc" ? " active" : "")}
          onClick={() => onNav("disc")}
        >
          💿 光盘
        </div>
        <div
          className={"nav-item" + (hasPlaying ? "" : " dim")}
          onClick={onOpenPlaying}
        >
          ▶ 正在播放
        </div>
        <div
          className={"nav-item" + (view === "library" ? " active" : "")}
          onClick={() => onNav("library")}
        >
          ◈ 本地光盘库
        </div>
      </nav>
    </aside>
  );
}
