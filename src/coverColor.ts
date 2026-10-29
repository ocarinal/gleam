const FALLBACK = "#4cc2ff";

export function hexToRgbTriplet(hex: string): string {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return "76, 194, 255";
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const to = (v: number) =>
    Math.round(Math.max(0, Math.min(255, (v + m) * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsl(r: number, g: number, b: number) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 0.0001) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

/** 从封面中提取一个饱和度较高、适合作为强调色的颜色 */
export async function coverAccentColor(src: string): Promise<string> {
  if (!src) return FALLBACK;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await new Promise<void>((resolve, reject) => {
    if (img.complete && img.naturalWidth > 0) return resolve();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("cover load failed"));
  });
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return FALLBACK;
  ctx.drawImage(img, 0, 0, size, size);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return FALLBACK; // 跨域封面被 canvas 污染
  }

  // 按色相分桶, 用饱和度 × 中间亮度加权, 取最突出的一组
  const bins = Array.from({ length: 24 }, () => ({
    w: 0, r: 0, g: 0, b: 0,
  }));
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 160) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const { h, s, l } = rgbToHsl(r, g, b);
    if (s < 0.22 || l < 0.12 || l > 0.9) continue;
    const weight = s * (1 - Math.abs(l - 0.55) * 1.4);
    if (weight <= 0.015) continue;
    const idx = Math.min(23, Math.max(0, Math.floor(h / 15)));
    const bin = bins[idx];
    bin.w += weight;
    bin.r += r * weight;
    bin.g += g * weight;
    bin.b += b * weight;
  }
  let best = -1;
  for (let i = 0; i < bins.length; i++) {
    if (best < 0 || bins[i].w > bins[best].w) best = i;
  }
  if (best < 0 || bins[best].w < 0.8) return FALLBACK;

  const a = bins[best];
  const r = a.r / a.w, g = a.g / a.w, b = a.b / a.w;
  const hsl = rgbToHsl(r, g, b);
  // 提饱和/控制亮度, 保证在深色界面上清晰可读
  const s = Math.max(0.58, Math.min(0.86, hsl.s));
  const l = Math.max(0.56, Math.min(0.68, hsl.l));
  return hslToHex(hsl.h, s, l);
}

export { FALLBACK };
