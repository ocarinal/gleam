/** LRC 解析 + 翻译合并 */
export interface LrcLine {
  t: number; // 秒
  text: string;
  tr?: string; // 翻译
}

function parseOne(s: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const line of s.split("\n")) {
    const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    if (m) {
      const t = Math.round(((+m[1]) * 60 + (+m[2])) * 10);
      out.set(t, m[3] ?? "");
    }
  }
  return out;
}

export function parseLrc(lrc: string, tlyric?: string | null): LrcLine[] {
  if (!lrc) return [];
  const base = parseOne(lrc);
  const tr = tlyric ? parseOne(tlyric) : new Map<number, string>();
  const times = Array.from(new Set([...base.keys(), ...tr.keys()])).sort((a, b) => a - b);
  return times.map((t) => ({
    t: t / 10,
    text: base.get(t) ?? "",
    tr: tr.get(t) || undefined,
  }));
}

/** 当前时间对应的行号 */
export function currentLine(lines: LrcLine[], t: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= t + 0.2) idx = i;
    else break;
  }
  return idx;
}
