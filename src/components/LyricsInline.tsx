import { useEffect, useRef, useState } from "react";
import { currentLine, type LrcLine } from "../lrc";

/** 内嵌歌词面板 (封面右侧), 同步滚动 + 点行跳转 */
export function LyricsInline({
  lines,
  time,
  source,
  onSeek,
  onRetry,
  idle,
}: {
  lines: LrcLine[];
  time: number;
  source: string;
  onSeek: (t: number) => void;
  onRetry?: () => void;
  idle?: string;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(-1);

  useEffect(() => {
    setCur(currentLine(lines, time));
  }, [time, lines]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || cur < 0) return;
    const target = el.children[cur] as HTMLElement | undefined;
    if (!target) return;
    const top = target.offsetTop - el.clientHeight / 2 + target.clientHeight / 2;
    el.scrollTo({ top, behavior: "smooth" });
  }, [cur]);

  if (lines.length === 0) {
    if (idle) {
      return <div className="li-none li-idle">{idle}</div>;
    }
    return (
      <div className="li-none">
        <div>{source || "暂无歌词"}</div>
        {onRetry && (
          <button className="li-retry" onClick={onRetry}>
            ⟳ 重新查找
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="li" ref={bodyRef}>
      <div className="li-source">{source}</div>
      {lines.map((l, i) => (
        <div
          key={i}
          className={"li-line" + (i === cur ? " active" : "")}
          onClick={() => l.t > 0 && onSeek(l.t)}
          title={l.t > 0 ? `跳转至 ${l.t.toFixed(0)}s` : undefined}
        >
          {l.text || "· · ·"}
          {l.tr && <span className="li-tr">{l.tr}</span>}
        </div>
      ))}
    </div>
  );
}
