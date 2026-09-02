import { useState } from "react";
import type { Release } from "../api";

export function SearchPanel({
  onSearch,
  onPick,
}: {
  onSearch: (q: string) => Promise<Release[]>;
  onPick: (r: Release) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Release[] | null>(null);

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

  return (
    <div className="search-panel">
      <div className="search-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="歌手 专辑名, 如: RADWIMPS 君の名は。"
        />
        <button className="btn" onClick={run} disabled={busy}>
          {busy ? "搜索中…" : "搜索"}
        </button>
      </div>
      {results && results.length === 0 && (
        <p className="muted">没有结果 — 换个关键词试试</p>
      )}
      {results && results.length > 0 && (
        <ul className="cand-list">
          {results.map((r) => (
            <li key={r.id}>
              <button className="cand" onClick={() => onPick(r)}>
                <span className="cand-title">
                  {r.title} <i>{r.disambiguation || ""}</i>
                </span>
                <span className="cand-meta">
                  {r.artistCredit?.map((a) => a.name).join(" / ") || ""} · {meta(r)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
