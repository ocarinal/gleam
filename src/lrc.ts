/** LRC 解析 + 翻译合并 + 增强 LRC 逐词标签 */
export interface LrcWord {
  t: number; // 秒
  text: string;
}

export interface LrcLine {
  t: number; // 秒
  text: string;
  tr?: string; // 翻译
  /** 增强 LRC 的 <mm:ss.xx> 逐词时间（有则精确，无则由前端按行时长插值） */
  words?: LrcWord[];
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

const WORD_TAG = /<(\d+):(\d+(?:\.\d+)?)>/g;

/** 去掉增强 LRC 的 <mm:ss.xx> 标签，并保留每段的起始时间 */
function parseLineText(raw: string, lineT: number): { text: string; words?: LrcWord[] } {
  const tags = [...raw.matchAll(WORD_TAG)];
  if (tags.length === 0) return { text: raw };
  const words: LrcWord[] = [];
  let cursor = 0;
  let at = lineT;
  for (const m of tags) {
    const chunk = raw.slice(cursor, m.index ?? 0);
    if (chunk) words.push({ t: at, text: chunk });
    at = (+m[1]) * 60 + (+m[2]);
    cursor = (m.index ?? 0) + m[0].length;
  }
  const tail = raw.slice(cursor);
  if (tail) words.push({ t: at, text: tail });
  return {
    text: words.map((w) => w.text).join(""),
    words: words.length > 0 ? words : undefined,
  };
}

export function parseLrc(lrc: string, tlyric?: string | null): LrcLine[] {
  if (!lrc) return [];
  const base = parseOne(lrc);
  const tr = tlyric ? parseOne(tlyric) : new Map<number, string>();
  const times = Array.from(new Set([...base.keys(), ...tr.keys()])).sort((a, b) => a - b);
  return times.map((t) => {
    const parsed = parseLineText(base.get(t) ?? "", t / 10);
    return {
      t: t / 10,
      text: parsed.text,
      tr: tr.get(t) || undefined,
      words: parsed.words,
    };
  });
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
