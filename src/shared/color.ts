import type { Hue } from "./types.ts";

/** Colour maths for palettes, accents and colour filters. RGB channels are 0–255. */

export type RGB = [number, number, number];

export function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function fromHex(hex: string): RGB {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join("") : m[1]!;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Hue 0–360, saturation and lightness 0–1. */
export function toHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  h *= 60;
  return [h, s, l];
}

export function fromHsl(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** WCAG relative luminance, 0–1. */
export function relativeLuminance([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Perceived brightness (the "L" of Lab, scaled 0–1). Better than WCAG luminance for "is this picture dark?". */
export function lightness(rgb: RGB): number {
  const y = relativeLuminance(rgb);
  return (y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y) / 100;
}

export function hueOf(hex: string): Hue {
  const [h, s, l] = toHsl(fromHex(hex));
  if (s < 0.18 || l < 0.08 || l > 0.94) return "neutral";
  if (h < 15 || h >= 345) return "red";
  if (h < 42) return "orange";
  if (h < 68) return "yellow";
  if (h < 160) return "green";
  if (h < 195) return "teal";
  if (h < 255) return "blue";
  if (h < 295) return "purple";
  return "pink";
}

export const HUES: { hue: Hue; label: string; swatch: string }[] = [
  { hue: "red", label: "Red", swatch: "#E5484D" },
  { hue: "orange", label: "Orange", swatch: "#F76B15" },
  { hue: "yellow", label: "Yellow", swatch: "#FFC53D" },
  { hue: "green", label: "Green", swatch: "#46A758" },
  { hue: "teal", label: "Teal", swatch: "#12A594" },
  { hue: "blue", label: "Blue", swatch: "#3E63DD" },
  { hue: "purple", label: "Purple", swatch: "#8E4EC6" },
  { hue: "pink", label: "Pink", swatch: "#D6409F" },
  { hue: "neutral", label: "Mono", swatch: "#8B8D98" },
];

type Bucket = { rgb: RGB; n: number };

function dist2(a: RGB, b: RGB): number {
  // Weighted ("redmean") distance: closer to how different colours look than plain RGB.
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

export type Palette = { colors: string[]; weights: number[]; accent: string; luminance: number };

/**
 * Dominant colours of a picture from its RGBA pixels (a small thumbnail is plenty). Pixels are
 * bucketed, then clustered with k-means seeded deterministically, so the same image always gives
 * the same palette. `bgra` is for Electron's nativeImage bitmaps.
 */
export function extractPalette(pixels: Uint8Array | Uint8ClampedArray, opts: { k?: number; bgra?: boolean } = {}): Palette {
  const k = opts.k ?? 6;
  const counts = new Map<number, Bucket>();
  let lumSum = 0;
  let total = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3]! < 128) continue;
    const r = opts.bgra ? pixels[i + 2]! : pixels[i]!;
    const g = pixels[i + 1]!;
    const b = opts.bgra ? pixels[i]! : pixels[i + 2]!;
    lumSum += lightness([r, g, b]);
    total++;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bucket = counts.get(key);
    if (bucket) {
      bucket.rgb[0] += r;
      bucket.rgb[1] += g;
      bucket.rgb[2] += b;
      bucket.n++;
    } else counts.set(key, { rgb: [r, g, b], n: 1 });
  }
  if (!total) return { colors: ["#000000"], weights: [1], accent: "#8B7CF6", luminance: 0 };
  const buckets = [...counts.values()].map((b) => ({ rgb: [b.rgb[0] / b.n, b.rgb[1] / b.n, b.rgb[2] / b.n] as RGB, n: b.n }));
  buckets.sort((a, b) => b.n - a.n);

  // Seeds: the most common bucket, then repeatedly the bucket farthest from all seeds (weighted by size).
  const centres: RGB[] = [buckets[0]!.rgb];
  while (centres.length < Math.min(k, buckets.length)) {
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i]!;
      const d = Math.min(...centres.map((c) => dist2(c, b.rgb)));
      const score = d * Math.sqrt(b.n);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (bestScore <= 0) break;
    centres.push(buckets[best]!.rgb);
  }

  let assign = new Array<number>(buckets.length).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    assign = buckets.map((b) => {
      let bi = 0;
      let bd = Infinity;
      centres.forEach((c, ci) => {
        const d = dist2(c, b.rgb);
        if (d < bd) {
          bd = d;
          bi = ci;
        }
      });
      return bi;
    });
    const sums = centres.map(() => [0, 0, 0, 0]);
    buckets.forEach((b, i) => {
      const s = sums[assign[i]!]!;
      s[0]! += b.rgb[0] * b.n;
      s[1]! += b.rgb[1] * b.n;
      s[2]! += b.rgb[2] * b.n;
      s[3]! += b.n;
    });
    let moved = false;
    sums.forEach((s, ci) => {
      if (!s[3]) return;
      const next: RGB = [s[0]! / s[3], s[1]! / s[3], s[2]! / s[3]];
      if (dist2(next, centres[ci]!) > 1) moved = true;
      centres[ci] = next;
    });
    if (!moved) break;
  }

  const weights = centres.map(() => 0);
  buckets.forEach((b, i) => (weights[assign[i]!]! += b.n));
  let clusters = centres.map((c, i) => ({ rgb: c, w: weights[i]! / total })).filter((c) => c.w > 0.004);
  clusters.sort((a, b) => b.w - a.w);
  // Merge clusters that look the same.
  const merged: typeof clusters = [];
  for (const c of clusters) {
    const twin = merged.find((m) => dist2(m.rgb, c.rgb) < 900);
    if (twin) twin.w += c.w;
    else merged.push({ ...c });
  }
  clusters = merged;

  const colors = clusters.map((c) => toHex(c.rgb));
  return { colors, weights: clusters.map((c) => Math.round(c.w * 1000) / 1000), accent: pickAccent(clusters), luminance: Math.round((lumSum / total) * 1000) / 1000 };
}

/**
 * The colour the interface should glow with: the most colourful cluster that's a real part of
 * the picture, brightened so it reads on a dark, glassy window.
 */
function pickAccent(clusters: { rgb: RGB; w: number }[]): string {
  let best: { rgb: RGB; score: number } | null = null;
  for (const c of clusters) {
    const [, s, l] = toHsl(c.rgb);
    if (s < 0.2 || l < 0.12 || l > 0.92) continue;
    const score = s * Math.pow(c.w, 0.35) * (1 - Math.abs(l - 0.55));
    if (!best || score > best.score) best = { rgb: c.rgb, score };
  }
  if (!best) return "#A89BFF";
  return uiAccent(toHex(best.rgb));
}

/** Pushes a colour into the range that reads well as an accent on a dark interface. */
export function uiAccent(hex: string): string {
  const [h, s, l] = toHsl(fromHex(hex));
  return toHex(fromHsl(h, Math.max(0.55, Math.min(0.95, s)), Math.max(0.6, Math.min(0.74, l))));
}

/** Black or white text for a background colour. */
export function inkOn(hex: string): "#0B0B10" | "#FFFFFF" {
  return relativeLuminance(fromHex(hex)) > 0.42 ? "#0B0B10" : "#FFFFFF";
}
