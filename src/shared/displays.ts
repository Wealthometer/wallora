import type { DisplayInfo, Fit } from "./types.ts";

/** Laying out displays for the arrangement map, and matching Windows' monitor list to Electron's. */

/** Scales the displays' desktop rectangles to fit a box, for drawing them like Windows Settings does. */
export function arrangement(displays: DisplayInfo[], boxW: number, boxH: number, gap = 6): { id: string; x: number; y: number; w: number; h: number }[] {
  if (!displays.length) return [];
  const minX = Math.min(...displays.map((d) => d.bounds.x));
  const minY = Math.min(...displays.map((d) => d.bounds.y));
  const maxX = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width));
  const maxY = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height));
  const scale = Math.min(boxW / (maxX - minX), boxH / (maxY - minY));
  const offX = (boxW - (maxX - minX) * scale) / 2;
  const offY = (boxH - (maxY - minY) * scale) / 2;
  return displays.map((d) => ({
    id: d.id,
    x: offX + (d.bounds.x - minX) * scale + gap / 2,
    y: offY + (d.bounds.y - minY) * scale + gap / 2,
    w: Math.max(8, d.bounds.width * scale - gap),
    h: Math.max(8, d.bounds.height * scale - gap),
  }));
}

export type MonitorRect = { id: string; left: number; top: number; right: number; bottom: number };

/**
 * Windows identifies monitors by device path and physical-pixel rectangles; Electron by numeric id
 * and scaled rectangles. Match each display to the monitor whose rectangle overlaps it most.
 * `physical` gives a display's rectangle in physical pixels (Electron's screen.dipToScreenRect).
 */
export function matchMonitors(displays: DisplayInfo[], monitors: MonitorRect[], physical: (d: DisplayInfo) => { x: number; y: number; width: number; height: number }): Map<string, string> {
  const out = new Map<string, string>();
  const free = new Set(monitors.map((m) => m.id));
  for (const d of displays) {
    const r = physical(d);
    let best: string | null = null;
    let bestArea = 0;
    for (const m of monitors) {
      if (!free.has(m.id)) continue;
      const w = Math.min(r.x + r.width, m.right) - Math.max(r.x, m.left);
      const h = Math.min(r.y + r.height, m.bottom) - Math.max(r.y, m.top);
      const area = w > 0 && h > 0 ? w * h : 0;
      if (area > bestArea) {
        bestArea = area;
        best = m.id;
      }
    }
    if (best) {
      out.set(d.id, best);
      free.delete(best);
    }
  }
  // Anything unmatched (odd scaling setups) pairs up in order.
  const left = monitors.filter((m) => free.has(m.id));
  for (const d of displays) if (!out.has(d.id) && left.length) out.set(d.id, left.shift()!.id);
  return out;
}

/** Windows' DESKTOP_WALLPAPER_POSITION values. */
export const WINDOWS_POSITION: Record<Fit, number> = { center: 0, tile: 1, stretch: 2, fit: 3, fill: 4, span: 5 };

/** GNOME's picture-options for each fit. */
export const GNOME_OPTION: Record<Fit, string> = { center: "centered", tile: "wallpaper", stretch: "stretched", fit: "scaled", fill: "zoom", span: "spanned" };

/** How well a picture suits a display: "Sharp" when it's at least as big, otherwise how much it's stretched. */
export function sharpness(img: { width: number; height: number }, display: { width: number; height: number }, fit: Fit): "sharp" | "soft" | "blurry" {
  const sx = display.width / img.width;
  const sy = display.height / img.height;
  const scale = fit === "fit" ? Math.min(sx, sy) : fit === "center" || fit === "tile" ? 1 : Math.max(sx, sy);
  return scale <= 1.05 ? "sharp" : scale <= 1.6 ? "soft" : "blurry";
}

export function resolutionLabel(w: number, h: number): string {
  const long = Math.max(w, h);
  if (long >= 7680) return "8K";
  if (long >= 5120) return "5K";
  if (long >= 3840) return "4K";
  if (long >= 2560) return "QHD";
  if (long >= 1920) return "Full HD";
  if (long >= 1280) return "HD";
  return `${w}×${h}`;
}
