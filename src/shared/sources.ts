import type { OnlinePage, OnlineResult } from "./types.ts";

/**
 * Online wallpaper sources. Wallhaven (https://wallhaven.cc/help/api) has a public search API;
 * without an API key it only returns safe-for-work images, which is all Wallora ever asks for.
 * Bing's "image of the day" archive gives the last eight days of Bing homepage photos.
 */

export type WallhavenSort = "toplist" | "date_added" | "random" | "views" | "favorites" | "relevance";

export type WallhavenQuery = {
  q: string;
  sorting: WallhavenSort;
  /** Wallhaven colour names are hex without "#", from its fixed palette. */
  color: string | null;
  /** "1920x1080" etc.; results are at least this big. */
  atleast: string | null;
  ratios: "any" | "landscape" | "portrait" | "16x9" | "21x9" | "32x9";
  topRange: "1M" | "3M" | "6M" | "1y";
  page: number;
  seed: string | null;
};

export const DEFAULT_WALLHAVEN: WallhavenQuery = { q: "", sorting: "toplist", color: null, atleast: "1920x1080", ratios: "landscape", topRange: "1M", page: 1, seed: null };

/** Wallhaven's own colour filter palette. */
export const WALLHAVEN_COLORS = [
  "660000", "990000", "cc0000", "cc3333", "ea4c88", "993399", "663399", "333399", "0066cc", "0099cc", "66cccc", "77cc33", "669900", "336600", "666600", "999900", "cccc33", "ffff00", "ffcc33", "ff9900", "ff6600", "cc6633", "996633", "663300", "000000", "999999", "cccccc", "ffffff", "424153",
];

export function wallhavenUrl(q: WallhavenQuery, apiKey = ""): string {
  const p = new URLSearchParams();
  if (q.q.trim()) p.set("q", q.q.trim());
  // General, anime and people categories; safe-for-work only, whatever the key allows.
  p.set("categories", "111");
  p.set("purity", "100");
  p.set("sorting", q.sorting);
  p.set("order", "desc");
  if (q.sorting === "toplist") p.set("topRange", q.topRange);
  if (q.color) p.set("colors", q.color.replace("#", "").toLowerCase());
  if (q.atleast) p.set("atleast", q.atleast);
  if (q.ratios !== "any") p.set("ratios", q.ratios);
  if (q.page > 1) p.set("page", String(q.page));
  if (q.sorting === "random" && q.seed) p.set("seed", q.seed);
  if (apiKey.trim()) p.set("apikey", apiKey.trim());
  return `https://wallhaven.cc/api/v1/search?${p.toString()}`;
}

type WallhavenItem = {
  id: string;
  url: string;
  purity: string;
  dimension_x: number;
  dimension_y: number;
  file_type: string;
  colors?: string[];
  path: string;
  thumbs: { large?: string; original?: string; small?: string };
  uploader?: { username?: string };
};

export class SourceError extends Error {}

export function parseWallhaven(json: unknown, have: (sourceId: string) => boolean): OnlinePage {
  const body = json as { data?: WallhavenItem[]; meta?: { current_page?: number; last_page?: number; total?: number; seed?: string | null }; error?: string };
  if (!body || !Array.isArray(body.data)) throw new SourceError(body?.error ? `Wallhaven: ${body.error}` : "Wallhaven sent something unexpected");
  const results: OnlineResult[] = body.data
    .filter((d) => d && d.purity === "sfw" && typeof d.path === "string" && /^https:\/\//.test(d.path))
    .map((d) => ({
      source: "wallhaven",
      sourceId: d.id,
      title: `Wallhaven ${d.id}`,
      thumb: d.thumbs.large ?? d.thumbs.original ?? d.thumbs.small ?? d.path,
      full: d.path,
      pageUrl: d.url,
      credit: d.uploader?.username ? `${d.uploader.username} on Wallhaven` : "Wallhaven",
      width: d.dimension_x,
      height: d.dimension_y,
      colors: (d.colors ?? []).map((c) => c.toUpperCase()),
      fileType: d.file_type,
      have: have(d.id),
    }));
  const m = body.meta ?? {};
  return { results, page: m.current_page ?? 1, lastPage: m.last_page ?? 1, total: m.total ?? results.length, seed: m.seed ?? null };
}

export const BING_URL = "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=en-US";

type BingImage = { startdate: string; urlbase: string; url: string; copyright?: string; copyrightlink?: string; title?: string };

/** "Sunrise over Lagos (© Someone/Getty Images)" → title and credit. */
export function splitCopyright(s: string): { title: string; credit: string | null } {
  const m = /^(.*?)\s*\((©[^)]*)\)\s*$/.exec(s);
  return m ? { title: m[1]!.trim(), credit: m[2]!.trim() } : { title: s.trim(), credit: null };
}

export function parseBing(json: unknown, have: (sourceId: string) => boolean): OnlinePage {
  const body = json as { images?: BingImage[] };
  if (!body || !Array.isArray(body.images)) throw new SourceError("Bing sent something unexpected");
  const results: OnlineResult[] = body.images
    .filter((i) => typeof i.urlbase === "string" && i.urlbase.startsWith("/"))
    .map((i) => {
      const { title, credit } = splitCopyright(i.copyright ?? i.title ?? "Bing image of the day");
      const date = `${i.startdate.slice(0, 4)}-${i.startdate.slice(4, 6)}-${i.startdate.slice(6, 8)}`;
      return {
        source: "bing" as const,
        sourceId: `bing-${i.startdate}-${i.urlbase.split("OHR.")[1]?.split("_")[0] ?? "img"}`,
        title: i.title ? `${i.title} · ${date}` : `${title} · ${date}`,
        thumb: `https://www.bing.com${i.urlbase}_800x480.jpg`,
        full: `https://www.bing.com${i.urlbase}_UHD.jpg`,
        pageUrl: i.copyrightlink && /^https:\/\//.test(i.copyrightlink) ? i.copyrightlink : "https://www.bing.com",
        credit,
        width: 3840,
        height: 2160,
        colors: [],
        fileType: "image/jpeg",
        have: false,
      };
    })
    .map((r) => ({ ...r, have: have(r.sourceId) }));
  return { results, page: 1, lastPage: 1, total: results.length, seed: null };
}

/** A safe file name for a download: "wallhaven-94x38z.jpg". */
export function downloadName(r: Pick<OnlineResult, "source" | "sourceId" | "full" | "fileType">): string {
  const ext = r.fileType === "image/png" || /\.png(\?|$)/i.test(r.full) ? "png" : "jpg";
  const id = r.sourceId.replace(/[^a-z0-9_-]/gi, "").slice(0, 60) || "image";
  return r.source === "bing" ? `${id}.${ext}` : `wallhaven-${id}.${ext}`;
}

/** Only these hosts are ever downloaded from, whatever an API response says. */
export function allowedDownload(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "w.wallhaven.cc" || u.hostname === "th.wallhaven.cc" || u.hostname === "www.bing.com");
  } catch {
    return false;
  }
}
