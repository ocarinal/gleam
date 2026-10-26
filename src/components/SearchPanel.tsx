import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Release } from "../api";

/** 搜索专辑: 居中模态框 (替代原来贴在底部的裸输入框) */
export function SearchPanel({
  onSearch,
  onPick,
  onClose,
}: {
  onSearch: (q: string) => Promise<Release[]>;
  onPick: (r: Release) => Promise<void>;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Release[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const run = async () => {
    if (!q.trim() || busy) return;
    setBusy(true);
    try {
      setResults(await onSearch(q.trim()));
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  const meta = (r: Release) =>
    [r.date, r.country, r.status === "Official" ? "官方" : r.status]
      .filter(Boolean)
      .join(" · ");

  return createPortal(
    <div
      className="search-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="search-modal" role="dialog" aria-modal="true" aria-label="搜索专辑">
        <div className="search-head">
          <div>
            <div className="search-title">搜索专辑</div>
            <div className="search-sub">按歌手 / 专辑名在 MusicBrainz 中查找</div>
          </div>
          <button className="search-close" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        <div className="search-row">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="歌手 专辑名，如 RADWIMPS 君の名は。"
          />
          <button className="btn" onClick={run} disabled={busy}>
            {busy ? "搜索中…" : "搜索"}
          </button>
        </div>

        <div className="search-body">
          {!results && !busy && (
            <div className="search-empty">
              <div className="search-empty-icon">◌</div>
              <div>输入歌手或专辑名开始搜索</div>
            </div>
          )}
          {busy && (
            <div className="search-empty">
              <div className="search-spinner" />
              <div>正在查询 MusicBrainz…</div>
            </div>
          )}
          {results && results.length === 0 && !busy && (
            <div className="search-empty">
              <div className="search-empty-icon">∅</div>
              <div>没有结果，换个关键词试试</div>
            </div>
          )}
          {results && results.length > 0 && !busy && (
            <ul className="cand-list">
              {results.map((r) => (
                <li key={r.id}>
                  <button className="cand" onClick={() => void onPick(r)}>
                    <span className="cand-main">
                      <span className="cand-title">
                        {r.title}
                        {r.disambiguation ? <i>{r.disambiguation}</i> : null}
                      </span>
                      <span className="cand-artist">
                        {r.artistCredit?.map((a) => a.name).join(" / ") || "未知艺人"}
                      </span>
                    </span>
                    <span className="cand-meta">{meta(r)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="search-foot">
          <span>Enter 搜索 · Esc 关闭</span>
          <span>{results ? `${results.length} 个结果` : ""}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
