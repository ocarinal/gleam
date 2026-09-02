import { getCurrentWindow } from "@tauri-apps/api/window";

export function TitleBar() {
  const win = getCurrentWindow();
  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-btns">
        <button
          className="tb-btn"
          onClick={() => void win.minimize()}
          title="最小化"
        >
          ─
        </button>
        <button
          className="tb-btn"
          onClick={() => void win.toggleMaximize()}
          title="最大化"
        >
          □
        </button>
        <button
          className="tb-btn tb-close"
          onClick={() => void win.close()}
          title="关闭"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
