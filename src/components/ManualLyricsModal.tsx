import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** 手动查找歌词: 歌名/歌手预填当前曲目, 结果由外部写入本地缓存 */
export function ManualLyricsModal({
  initialTitle,
  initialArtist,
  onSearch,
  onClose,
}: {
  initialTitle: string;
  initialArtist: string;
  onSearch: (title: string, artist: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const artistRef = useRef<HTMLInputElement>(null);

  // 只在挂载时聚焦歌名; 不能依赖 onClose/busy, 否则播放进度刷新会让焦点反复跳回歌名
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose, busy]);

  const submit = async () => {
    const t = (titleRef.current?.value ?? "").trim();
    const a = (artistRef.current?.value ?? "").trim();
    if (!t) {
      setError("请输入歌名");
      titleRef.current?.focus();
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const ok = await onSearch(t, a);
      if (ok) onClose();
      else setError("没有找到歌词，换一个歌名或歌手再试试");
    } catch {
      setError("查找失败，请检查网络后重试");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="manual-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="manual-modal" role="dialog" aria-modal="true">
        <div className="manual-kicker">歌词</div>
        <div className="manual-title">手动查找歌词</div>
        <div className="manual-sub">
          用歌名和歌手搜索；找到后会记住这次选择，下次播放不再重新搜索。
        </div>

        <label className="manual-field">
          <span>歌名</span>
          <input
            ref={titleRef}
            defaultValue={initialTitle}
            autoComplete="off"
            spellCheck={false}
            onChange={() => error && setError("")}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            placeholder="例如：時よ"
          />
        </label>
        <label className="manual-field">
          <span>歌手</span>
          <input
            ref={artistRef}
            defaultValue={initialArtist}
            autoComplete="off"
            spellCheck={false}
            onChange={() => error && setError("")}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            placeholder="例如：星野源"
          />
        </label>

        {error ? <div className="manual-error">{error}</div> : null}

        <div className="manual-actions">
          <button
            className="btn"
            onClick={() => void submit()}
            disabled={busy}
          >
            {busy ? "查找中…" : "查找并保存"}
          </button>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            取消
          </button>
        </div>
        <div className="manual-foot">
          结果会保存到本地缓存，之后同一首曲目会直接使用。
        </div>
      </div>
    </div>,
    document.body
  );
}
