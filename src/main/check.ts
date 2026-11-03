import type { WallhavenQuery } from "../shared/sources.ts";
import type { Fit, Location, OnlineResult, RuleTime, ScheduleRule, Settings, SmartRules } from "../shared/types.ts";

/** The window is trusted code, but IPC arguments are still checked: bad data must never reach SQLite or the shell. */

export class BadInput extends Error {}

export function str(v: unknown, max = 500): string {
  if (typeof v !== "string") throw new BadInput("Expected text");
  return v.slice(0, max);
}

export function bool(v: unknown): boolean {
  if (typeof v !== "boolean") throw new BadInput("Expected true or false");
  return v;
}

export function ids(v: unknown): string[] {
  if (!Array.isArray(v) || v.length > 100_000) throw new BadInput("Expected a list of ids");
  return v.map((x) => str(x, 64));
}

export function optId(v: unknown): string | null {
  return v === null ? null : str(v, 64);
}

const FITS: Fit[] = ["fill", "fit", "stretch", "center", "tile", "span"];
const HUES = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "neutral"];
const SOURCES = ["folder", "import", "wallhaven", "bing"];

export function smart(v: unknown): SmartRules | null {
  if (v === null) return null;
  const s = v as SmartRules;
  if (!s || typeof s !== "object") throw new BadInput("Bad smart rules");
  return {
    collections: ids(s.collections ?? []),
    favouritesOnly: !!s.favouritesOnly,
    hues: (Array.isArray(s.hues) ? s.hues : []).filter((h) => HUES.includes(h)),
    tone: s.tone === "light" || s.tone === "dark" ? s.tone : "any",
    minWidth: Math.max(0, Math.min(20_000, Number(s.minWidth) || 0)),
    sources: (Array.isArray(s.sources) ? s.sources : []).filter((x) => SOURCES.includes(x)),
  };
}

export function ruleTime(v: unknown): RuleTime {
  const t = v as RuleTime;
  if (t?.kind === "time" && Number.isFinite(t.minutes)) return { kind: "time", minutes: t.minutes };
  if (t?.kind === "sun" && ["dawn", "sunrise", "sunset", "dusk"].includes(t.event) && Number.isFinite(t.offset)) return { kind: "sun", event: t.event, offset: t.offset };
  throw new BadInput("Bad rule time");
}

export function rule(v: unknown): Omit<ScheduleRule, "id"> & { id?: string } {
  const r = v as ScheduleRule;
  if (!r || typeof r !== "object" || !Array.isArray(r.days)) throw new BadInput("Bad rule");
  return { id: r.id === undefined ? undefined : str(r.id, 64), days: r.days.map(Number), at: ruleTime(r.at), playlistId: str(r.playlistId, 64), enabled: r.enabled !== false };
}

function location(v: unknown): Location | null {
  if (v === null) return null;
  const l = v as Location;
  if (!l || !Number.isFinite(l.lat) || !Number.isFinite(l.lng) || Math.abs(l.lat) > 90 || Math.abs(l.lng) > 180) throw new BadInput("Bad location");
  return { name: str(l.name ?? "", 80), lat: l.lat, lng: l.lng };
}

export function settingsPatch(v: unknown): Partial<Settings> {
  const p = v as Partial<Settings>;
  if (!p || typeof p !== "object") throw new BadInput("Bad settings");
  const out: Partial<Settings> = {};
  if (p.fit !== undefined) {
    if (!FITS.includes(p.fit)) throw new BadInput("Bad fit");
    out.fit = p.fit;
  }
  if (p.displayMode !== undefined) {
    if (!["same", "different", "perDisplay"].includes(p.displayMode)) throw new BadInput("Bad display mode");
    out.displayMode = p.displayMode;
  }
  if (p.displayPlaylists !== undefined) {
    out.displayPlaylists = Object.fromEntries(Object.entries(p.displayPlaylists as Record<string, unknown>).map(([k, val]) => [str(k, 64), str(val, 64)]));
  }
  if (p.widgetLayer !== undefined) {
    if (p.widgetLayer !== "desktop" && p.widgetLayer !== "top") throw new BadInput("Bad widget layer");
    out.widgetLayer = p.widgetLayer;
  }
  for (const k of ["launchAtLogin", "startHidden", "closeToTray", "pauseOnBattery", "shortcuts", "scheduleEnabled", "liveAccent", "widgetsEnabled"] as const) if (p[k] !== undefined) out[k] = bool(p[k]);
  if (p.location !== undefined) out.location = location(p.location);
  if (p.wallhavenKey !== undefined) out.wallhavenKey = str(p.wallhavenKey, 100).trim();
  return out;
}

export function wallhavenQuery(v: unknown): WallhavenQuery {
  const q = v as WallhavenQuery;
  if (!q || typeof q !== "object") throw new BadInput("Bad search");
  const sorting = ["toplist", "date_added", "random", "views", "favorites", "relevance"].includes(q.sorting) ? q.sorting : "toplist";
  return {
    q: str(q.q ?? "", 120),
    sorting,
    color: q.color && /^#?[0-9a-f]{6}$/i.test(q.color) ? q.color : null,
    atleast: q.atleast && /^\d{3,5}x\d{3,5}$/.test(q.atleast) ? q.atleast : null,
    ratios: ["any", "landscape", "portrait", "16x9", "21x9", "32x9"].includes(q.ratios) ? q.ratios : "landscape",
    topRange: ["1M", "3M", "6M", "1y"].includes(q.topRange) ? q.topRange : "1M",
    page: Math.max(1, Math.min(1000, Math.floor(Number(q.page) || 1))),
    seed: q.seed && /^[a-z0-9]{1,12}$/i.test(q.seed) ? q.seed : null,
  };
}

export function onlineResult(v: unknown): OnlineResult {
  const r = v as OnlineResult;
  if (!r || (r.source !== "wallhaven" && r.source !== "bing")) throw new BadInput("Bad download");
  return { ...r, sourceId: str(r.sourceId, 80), title: str(r.title, 200), full: str(r.full, 500), pageUrl: str(r.pageUrl, 500), credit: r.credit === null ? null : str(r.credit, 200), fileType: str(r.fileType, 40) };
}
