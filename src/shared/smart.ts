import { hueOf } from "./color.ts";
import type { Hue, SmartRules, Tone, Wallpaper } from "./types.ts";

/** Library filtering, shared by smart playlists and the library's filter bar. */

export const EMPTY_RULES: SmartRules = { collections: [], favouritesOnly: false, hues: [], tone: "any", minWidth: 0, sources: [] };

export function toneOf(w: Pick<Wallpaper, "luminance">): Exclude<Tone, "any"> {
  return w.luminance >= 0.5 ? "light" : "dark";
}

/** The hues a wallpaper counts as: any colour that covers a fair share of it. */
export function huesOf(w: Pick<Wallpaper, "colors">): Hue[] {
  return [...new Set(w.colors.slice(0, 3).map(hueOf))];
}

export function matches(w: Wallpaper, rules: SmartRules, inCollections: (id: string) => Set<string>): boolean {
  if (w.missing) return false;
  if (rules.favouritesOnly && !w.favourite) return false;
  if (rules.tone !== "any" && toneOf(w) !== rules.tone) return false;
  if (rules.minWidth && w.width < rules.minWidth) return false;
  if (rules.sources.length && !rules.sources.includes(w.source)) return false;
  if (rules.hues.length) {
    const hs = huesOf(w);
    if (!rules.hues.some((h) => hs.includes(h))) return false;
  }
  if (rules.collections.length) {
    const cs = inCollections(w.id);
    if (!rules.collections.some((c) => cs.has(c))) return false;
  }
  return true;
}

export function describeRules(r: SmartRules, collectionName: (id: string) => string): string {
  const parts: string[] = [];
  if (r.favouritesOnly) parts.push("favourites");
  if (r.collections.length) parts.push(`from ${r.collections.map(collectionName).join(" or ")}`);
  if (r.hues.length) parts.push(r.hues.join("/"));
  if (r.tone !== "any") parts.push(r.tone);
  if (r.minWidth) parts.push(`${r.minWidth}px wide or more`);
  if (r.sources.length) parts.push(`from ${r.sources.join(", ")}`);
  return parts.length ? `Wallpapers that are ${parts.join(", ")}` : "Your whole library";
}

export type SortKey = "added" | "shown" | "name" | "color" | "brightness";

export function sortWallpapers(list: Wallpaper[], key: SortKey): Wallpaper[] {
  const a = [...list];
  switch (key) {
    case "added":
      return a.sort((x, y) => y.addedAt - x.addedAt);
    case "shown":
      return a.sort((x, y) => (y.lastShownAt ?? 0) - (x.lastShownAt ?? 0));
    case "name":
      return a.sort((x, y) => x.title.localeCompare(y.title, undefined, { numeric: true }));
    case "brightness":
      return a.sort((x, y) => y.luminance - x.luminance);
    case "color": {
      const order = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "neutral"];
      return a.sort((x, y) => order.indexOf(hueOf(x.accent)) - order.indexOf(hueOf(y.accent)) || y.luminance - x.luminance);
    }
  }
}

/** Groups of wallpapers that are the same file (same content hash). */
export function duplicates(list: Wallpaper[]): Wallpaper[][] {
  const by = new Map<string, Wallpaper[]>();
  for (const w of list) by.set(w.hash, [...(by.get(w.hash) ?? []), w]);
  return [...by.values()].filter((g) => g.length > 1).map((g) => g.sort((x, y) => x.addedAt - y.addedAt));
}

export function search(list: Wallpaper[], q: string): Wallpaper[] {
  const words = q.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((w) => {
    const hay = `${w.title} ${w.credit ?? ""} ${w.path} ${w.colors.map(hueOf).join(" ")}`.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
    return words.every((x) => hay.includes(x));
  });
}
