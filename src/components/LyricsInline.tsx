import { useEffect, useMemo, useRef, useState } from "react";
import { currentLine, type LrcLine } from "../lrc";

/** 当前行结束时间：优先用下一行，间隔过长时按字数估一个合理时长 */
function lineEnd(lines: LrcLine[], i: number): number {
  const line = lines[i];
  const next = lines[i + 1]?.t;
  const span = next != null ? next - line.t : 0;
  if (next != null && span >= 0.6 && span <= 12) return next;
  const n = Array.from(line.text).length;
  return line.t + Math.min(8, Math.max(1.8, n * 0.16));
}

/** 每个字符的起始时间：增强 LRC 用逐词标签，普通 LRC 在行时长内均分 */
function charTimes(line: LrcLine, end: number): number[] {
  const chars = Array.from(line.text);
  if (chars.length === 0) return [];
  if (line.words?.length) {
    const out: number[] = [];
    for (let i = 0; i < line.words.length; i++) {
      const w = line.words[i];
      const next = line.words[i + 1]?.t ?? end;
      const len = Array.from(w.text).length;
      for (let j = 0; j < len; j++) {
        out.push(w.t + Math.max(0, next - w.t) * (j / Math.max(1, len)));
      }
    }
    if (out.length === chars.length) return out;
  }
  const span = Math.max(0, end - line.t);
  return chars.map((_, i) => line.t + (span * i) / Math.max(1, chars.length));
}

/** 当前行的逐字点亮。用 rAF 在两次 progress 事件之间平滑补间 */
function KaraokeLine({
  text,
  times,
  time,
  paused,
}: {
  text: string;
  times: number[];
  time: number;
  paused: boolean;
}) {
  const [now, setNow] = useState(time);
  const anchor = useRef({ t: time, at: performance.now() });

  useEffect(() => {
    anchor.current = { t: time, at: performance.now() };
    setNow(time);
  }, [time]);

  useEffect(() => {
    if (paused) return;
    let raf = 0;
    const tick = () => {
      const a = anchor.current;
      setNow(a.t + (performance.now() - a.at) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, time]);

  return (
    <>
      {Array.from(text).map((ch, i) => (
        <span key={i} className={"li-ch" + (now >= (times[i] ?? 0) ? " on" : "")}>
          {ch}
        </span>
      ))}
    </>
  );
}

/** 估算一行的显示宽度 (CJK 按 1, 拉丁按 0.55, 空格按 0.35) */
function displayUnits(text: string): number {
  let n = 0;
  for (const ch of Array.from(text)) {
    if (/[\u3000-\u9fff\uff00-\uffef]/.test(ch)) n += 1;
    else if (/[A-Za-z0-9]/.test(ch)) n += 0.55;
    else if (ch === " ") n += 0.35;
    else n += 0.62;
  }
  return n;
}

/** 内嵌歌词面板 (封面左侧), 逐字点亮 + 同步滚动 + 点行跳转 */
export function LyricsInline({
  lines,
  time,
  source,
  onSeek,
  onRetry,
  idle,
  paused = false,
  onContextMenu,
  onManualSearch,
}: {
  lines: LrcLine[];
  time: number;
  source: string;
  onSeek: (t: number) => void;
  onRetry?: () => void;
  idle?: string;
  paused?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
  onManualSearch?: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(-1);
  const [fit, setFit] = useState(1);
  const maxUnits = useMemo(
    () => lines.reduce((m, l) => Math.max(m, displayUnits(l.text)), 0),
    [lines]
  );

  useEffect(() => {
    setCur(currentLine(lines, time));
  }, [time, lines]);

  // 长句多时按可用宽度整体缩小字号, 避免长行反复折行显得乱
  useEffect(() => {
    const update = () => {
      const el = bodyRef.current;
      if (!el || maxUnits <= 0) {
        setFit(1);
        return;
      }
      const fs = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--fs")
      ) || 1;
      const base = Math.max(21, Math.min(46, window.innerWidth * 0.0205)) * fs;
      const avail = Math.max(320, el.clientWidth - 2);
      // 允许约 1.65 行的宽度, 超出后整体收紧
      const raw = (avail * 1.65) / (maxUnits * base);
      setFit(Math.max(0.7, Math.min(1, raw)));
    };
    update();
    window.addEventListener("resize", update);
    let ro: ResizeObserver | undefined;
    if (bodyRef.current && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(bodyRef.current);
    }
    return () => {
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, [lines, maxUnits]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || cur < 0) return;
    // 注意 .li 的第一个子元素是 source，不能用 children[cur]
    const target = el.querySelectorAll<HTMLElement>(".li-line")[cur];
    if (!target) return;
    const top = target.offsetTop - el.clientHeight * 0.38 + target.clientHeight / 2;
    el.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [cur]);

  if (lines.length === 0) {
    if (idle) {
      return (
        <div className="li-none li-idle" onContextMenu={onContextMenu}>
          {idle}
        </div>
      );
    }
    return (
      <div className="li-none" onContextMenu={onContextMenu}>
        <div>{source || "暂无歌词"}</div>
        <div className="li-none-actions">
          {onRetry && (
            <button className="li-retry" onClick={onRetry}>
              ⟳ 重新查找
            </button>
          )}
          {onManualSearch && (
            <button className="li-retry li-manual" onClick={onManualSearch}>
              ⌕ 手动查找
            </button>
          )}
        </div>
      </div>
    );
  }

  const end = cur >= 0 ? lineEnd(lines, cur) : 0;
  const times = cur >= 0 ? charTimes(lines[cur], end) : [];

  return (
    <div
      className={"li" + (fit < 0.995 ? " li-long" : "")}
      ref={bodyRef}
      style={{ ["--li-fit" as string]: String(fit) } as React.CSSProperties}
      onContextMenu={onContextMenu}
    >
      {source ? <div className="li-source">{source}</div> : null}
      {lines.map((l, i) => {
        const active = i === cur;
        return (
          <div
            key={i}
            className={"li-line" + (active ? " active" : "")}
            onClick={() => l.t > 0 && onSeek(l.t)}
            title={l.t > 0 ? `跳转至 ${l.t.toFixed(0)}s` : undefined}
          >
            {active && l.text ? (
              <KaraokeLine text={l.text} times={times} time={time} paused={paused} />
            ) : (
              l.text || "· · ·"
            )}
            {active && l.tr && <span className="li-tr">{l.tr}</span>}
          </div>
        );
      })}
    </div>
  );
}
