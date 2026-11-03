/**
 * Desktop widgets, Rainmeter-style: clocks, the date, a calendar, system stats, weather, notes,
 * countdowns and the wallpaper that's playing, drawn on the desktop above the wallpaper and below
 * your windows. Plain data and pure functions; the main process keeps the list and the windows.
 */

export type WidgetKind = "clock" | "date" | "calendar" | "stats" | "weather" | "note" | "countdown" | "nowplaying";

export type ClockFace = "classic" | "stacked" | "words" | "analog" | "neon" | "minimal";

export type FontId = "serif" | "sans" | "condensed" | "mono" | "wide";

export type WidgetStyle = {
  font: FontId;
  /** "auto" picks a colour that reads well on the wallpaper behind it. */
  color: "auto" | string;
  /** 0.5 (small) to 3 (huge). */
  scale: number;
  /** 0.2 to 1. */
  opacity: number;
  panel: "none" | "glass" | "solid";
  shadow: boolean;
  align: "left" | "center" | "right";
};

export type WidgetOptions = {
  clock: { face: ClockFace; hour12: boolean; seconds: boolean; showDate: boolean; greeting: boolean };
  date: { format: "long" | "short" | "weekday" };
  calendar: { weekStart: 0 | 1 };
  stats: { cpu: boolean; memory: boolean; disk: boolean; battery: boolean; uptime: boolean };
  weather: { units: "c" | "f"; showRange: boolean };
  note: { text: string };
  countdown: { label: string; date: string };
  nowplaying: { palette: boolean };
};

export type Widget<K extends WidgetKind = WidgetKind> = {
  id: string;
  kind: K;
  /** A display id; widgets for a display that's gone wait until it's back. */
  display: string;
  /** Top-left corner as a fraction of the display's work area, so layouts survive resolution changes. */
  x: number;
  y: number;
  style: WidgetStyle;
  options: WidgetOptions[K];
};

export type AnyWidget = { [K in WidgetKind]: Widget<K> }[WidgetKind];

export const WIDGET_KINDS: { kind: WidgetKind; name: string; blurb: string }[] = [
  { kind: "clock", name: "Clock", blurb: "Six faces, from huge digits to words" },
  { kind: "date", name: "Date", blurb: "Today, written out" },
  { kind: "calendar", name: "Calendar", blurb: "This month at a glance" },
  { kind: "stats", name: "System", blurb: "CPU, memory, disk, battery" },
  { kind: "weather", name: "Weather", blurb: "Now and today's range" },
  { kind: "note", name: "Note", blurb: "A line you want to see every day" },
  { kind: "countdown", name: "Countdown", blurb: "Days until something good" },
  { kind: "nowplaying", name: "Now playing", blurb: "The wallpaper's name and colours" },
];

export const CLOCK_FACES: { id: ClockFace; name: string }[] = [
  { id: "classic", name: "Classic" },
  { id: "stacked", name: "Stacked" },
  { id: "words", name: "In words" },
  { id: "analog", name: "Analog" },
  { id: "neon", name: "Neon" },
  { id: "minimal", name: "Minimal" },
];

export const FONTS: { id: FontId; name: string; css: string }[] = [
  { id: "serif", name: "Editorial", css: '"Instrument Serif", Georgia, serif' },
  { id: "sans", name: "Clean", css: '"Manrope Variable", "Segoe UI", sans-serif' },
  { id: "condensed", name: "Poster", css: '"Bebas Neue", "Arial Narrow", sans-serif' },
  { id: "mono", name: "Terminal", css: '"JetBrains Mono Variable", Consolas, monospace' },
  { id: "wide", name: "Wide", css: '"Unbounded Variable", "Segoe UI", sans-serif' },
];

export const DEFAULT_STYLE: WidgetStyle = { font: "sans", color: "auto", scale: 1, opacity: 1, panel: "none", shadow: true, align: "left" };

export function defaultOptions<K extends WidgetKind>(kind: K): WidgetOptions[K] {
  const all: WidgetOptions = {
    clock: { face: "classic", hour12: false, seconds: false, showDate: true, greeting: false },
    date: { format: "long" },
    calendar: { weekStart: 1 },
    stats: { cpu: true, memory: true, disk: true, battery: true, uptime: false },
    weather: { units: "c", showRange: true },
    note: { text: "Make something today." },
    countdown: { label: "Holiday", date: "" },
    nowplaying: { palette: true },
  };
  return all[kind];
}

/** Where a new widget lands, so they don't pile up on top of each other. */
const SLOTS: [number, number][] = [
  [0.05, 0.07],
  [0.05, 0.4],
  [0.72, 0.07],
  [0.72, 0.45],
  [0.38, 0.07],
  [0.05, 0.7],
  [0.72, 0.75],
];

export function newWidget<K extends WidgetKind>(kind: K, id: string, display: string, existing: AnyWidget[]): Widget<K> {
  const taken = existing.filter((w) => w.display === display);
  const slot = SLOTS.find(([x, y]) => !taken.some((w) => Math.abs(w.x - x) < 0.12 && Math.abs(w.y - y) < 0.12)) ?? SLOTS[taken.length % SLOTS.length]!;
  const style: WidgetStyle = { ...DEFAULT_STYLE, ...(kind === "clock" ? { font: "serif" as FontId, scale: 1.4 } : {}), ...(kind === "calendar" || kind === "stats" || kind === "weather" ? { panel: "glass" as const } : {}) };
  return { id, kind, display, x: slot[0], y: slot[1], style, options: defaultOptions(kind) };
}

// ── Themes: one click restyles every widget ────────────────────────────────

export type WidgetTheme = { id: string; name: string; style: Partial<WidgetStyle>; clockFace?: ClockFace };

export const WIDGET_THEMES: WidgetTheme[] = [
  { id: "editorial", name: "Editorial", style: { font: "serif", color: "auto", panel: "none", shadow: true }, clockFace: "classic" },
  { id: "glass", name: "Frosted glass", style: { font: "sans", color: "auto", panel: "glass", shadow: false }, clockFace: "stacked" },
  { id: "poster", name: "Poster", style: { font: "condensed", color: "auto", panel: "none", shadow: true }, clockFace: "stacked" },
  { id: "terminal", name: "Terminal", style: { font: "mono", color: "#7CFFB2", panel: "solid", shadow: false }, clockFace: "minimal" },
  { id: "neon", name: "Neon", style: { font: "wide", color: "#FF5FD2", panel: "none", shadow: true }, clockFace: "neon" },
  { id: "quiet", name: "Quiet", style: { font: "sans", color: "auto", panel: "none", shadow: false, opacity: 0.7 }, clockFace: "words" },
];

export function applyTheme(widgets: AnyWidget[], themeId: string): AnyWidget[] {
  const t = WIDGET_THEMES.find((x) => x.id === themeId);
  if (!t) return widgets;
  return widgets.map((w) => {
    const style = { ...w.style, opacity: 1, ...t.style };
    if (w.kind === "clock" && t.clockFace) return { ...w, style, options: { ...w.options, face: t.clockFace } };
    return { ...w, style } as AnyWidget;
  });
}

// ── Checking what comes in over IPC ────────────────────────────────────────

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function cleanStyle(v: unknown, base: WidgetStyle = DEFAULT_STYLE): WidgetStyle {
  const s = (v && typeof v === "object" ? v : {}) as Partial<WidgetStyle>;
  return {
    font: FONTS.some((f) => f.id === s.font) ? s.font! : base.font,
    color: s.color === "auto" || (typeof s.color === "string" && /^#[0-9a-f]{6}$/i.test(s.color)) ? s.color : base.color,
    scale: clamp(s.scale, 0.5, 3, base.scale),
    opacity: clamp(s.opacity, 0.2, 1, base.opacity),
    panel: s.panel === "none" || s.panel === "glass" || s.panel === "solid" ? s.panel : base.panel,
    shadow: typeof s.shadow === "boolean" ? s.shadow : base.shadow,
    align: s.align === "left" || s.align === "center" || s.align === "right" ? s.align : base.align,
  };
}

/** Keeps only known option keys with the right types, falling back to the current values. */
export function cleanOptions<K extends WidgetKind>(kind: K, v: unknown, base: WidgetOptions[K] = defaultOptions(kind)): WidgetOptions[K] {
  const src = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  for (const [k, def] of Object.entries(base)) {
    const val = src[k];
    if (val === undefined) continue;
    if (typeof def === "boolean" && typeof val === "boolean") out[k] = val;
    else if (typeof def === "number" && (val === 0 || val === 1)) out[k] = val;
    else if (typeof def === "string" && typeof val === "string") out[k] = val.slice(0, k === "text" ? 400 : 60);
  }
  if (kind === "clock" && !CLOCK_FACES.some((f) => f.id === out.face)) out.face = (base as WidgetOptions["clock"]).face;
  if (kind === "date" && !["long", "short", "weekday"].includes(String(out.format))) out.format = "long";
  if (kind === "weather" && out.units !== "c" && out.units !== "f") out.units = "c";
  if (kind === "countdown" && out.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(out.date))) out.date = "";
  return out as WidgetOptions[K];
}

export function clampPosition(x: number, y: number): { x: number; y: number } {
  return { x: clamp(x, 0, 0.98, 0.05), y: clamp(y, 0, 0.98, 0.05) };
}

// ── What widgets show ──────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

export function clockParts(d: Date, o: { hour12: boolean; seconds: boolean }): { hours: string; minutes: string; seconds: string; period: string } {
  const h = d.getHours();
  const hours = o.hour12 ? String(h % 12 || 12) : pad(h);
  return { hours, minutes: pad(d.getMinutes()), seconds: pad(d.getSeconds()), period: o.hour12 ? (h < 12 ? "AM" : "PM") : "" };
}

const NUMBERS = ["twelve", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** "quarter past nine", "twenty to six", "eleven o'clock", to the nearest five minutes. */
export function timeInWords(d: Date): string {
  let m = Math.round(d.getMinutes() / 5) * 5;
  let h = d.getHours();
  if (m === 60) {
    m = 0;
    h += 1;
  }
  const hourName = (x: number) => NUMBERS[x % 12]!;
  if (m === 0) return h % 24 === 0 ? "midnight" : h % 24 === 12 ? "noon" : `${hourName(h)} o'clock`;
  const mins: Record<number, string> = { 5: "five", 10: "ten", 15: "quarter", 20: "twenty", 25: "twenty-five", 30: "half" };
  if (m <= 30) return `${mins[m]} past ${hourName(h)}`;
  return `${mins[60 - m]} to ${hourName(h + 1)}`;
}

export function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Good night";
}

/** Weeks of a month for a calendar: null for the blank days before the 1st and after the end. */
export function monthGrid(year: number, month: number, weekStart: 0 | 1): (number | null)[][] {
  const first = new Date(year, month, 1).getDay();
  const lead = (first - weekStart + 7) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function weekdayInitials(weekStart: 0 | 1, locale?: string): string[] {
  // 7 January 2024 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + ((i + weekStart) % 7)).toLocaleDateString(locale, { weekday: "narrow" }));
}

/** Whole days until a date (local midnight to local midnight); negative once it's passed. */
export function daysUntil(now: Date, isoDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function countdownText(days: number | null, label: string): { big: string; small: string } {
  const what = label.trim() || "the day";
  if (days === null) return { big: "—", small: "Pick a date" };
  if (days === 0) return { big: "Today", small: what };
  if (days === 1) return { big: "1", small: `day until ${what}` };
  if (days > 1) return { big: String(days), small: `days until ${what}` };
  return { big: String(-days), small: `${-days === 1 ? "day" : "days"} since ${what}` };
}

// ── System stats ───────────────────────────────────────────────────────────

export type CpuTimes = { idle: number; total: number };

export type SystemStats = {
  cpu: number | null;
  memory: { used: number; total: number };
  disk: { used: number; total: number } | null;
  uptime: number;
};

/** CPU use between two samples of summed per-core times, 0 to 100. */
export function cpuPercent(prev: CpuTimes | null, next: CpuTimes): number | null {
  if (!prev) return null;
  const total = next.total - prev.total;
  const idle = next.idle - prev.idle;
  if (total <= 0) return null;
  return Math.round(Math.min(100, Math.max(0, (1 - idle / total) * 100)));
}

export function formatBytes(n: number): string {
  if (n < 1024 ** 3) return `${Math.round(n / 1024 ** 2)} MB`;
  const g = n / 1024 ** 3;
  return g >= 1000 ? `${(g / 1024).toFixed(1)} TB` : `${g >= 100 ? Math.round(g) : g.toFixed(1)} GB`;
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

// ── Weather (Open-Meteo, no key needed) ────────────────────────────────────

export type Weather = { temp: number; feels: number; code: number; isDay: boolean; wind: number; max: number | null; min: number | null; at: number; place: string };

export function weatherUrl(lat: number, lng: number): string {
  const p = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lng.toFixed(3),
    current: "temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m",
    daily: "temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    forecast_days: "1",
  });
  return `https://api.open-meteo.com/v1/forecast?${p.toString()}`;
}

export function parseWeather(json: unknown, place: string, at: number): Weather {
  const j = json as { current?: Record<string, number>; daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] } };
  const c = j?.current;
  if (!c || typeof c.temperature_2m !== "number") throw new Error("The weather service sent something unexpected");
  return {
    temp: c.temperature_2m,
    feels: typeof c.apparent_temperature === "number" ? c.apparent_temperature : c.temperature_2m,
    code: Number(c.weather_code) || 0,
    isDay: c.is_day === 1,
    wind: Number(c.wind_speed_10m) || 0,
    max: j.daily?.temperature_2m_max?.[0] ?? null,
    min: j.daily?.temperature_2m_min?.[0] ?? null,
    at,
    place,
  };
}

/** WMO weather codes, in words, with the icon to draw. */
export function weatherLabel(code: number, isDay: boolean): { text: string; icon: "sun" | "moon" | "cloud-sun" | "cloud-moon" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "storm" } {
  if (code === 0) return { text: "Clear", icon: isDay ? "sun" : "moon" };
  if (code <= 2) return { text: code === 1 ? "Mostly clear" : "Partly cloudy", icon: isDay ? "cloud-sun" : "cloud-moon" };
  if (code === 3) return { text: "Cloudy", icon: "cloud" };
  if (code === 45 || code === 48) return { text: "Fog", icon: "fog" };
  if (code >= 51 && code <= 57) return { text: "Drizzle", icon: "drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { text: code >= 80 ? "Showers" : "Rain", icon: "rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { text: "Snow", icon: "snow" };
  if (code >= 95) return { text: "Thunderstorm", icon: "storm" };
  return { text: "—", icon: "cloud" };
}

export function temperature(c: number, units: "c" | "f"): string {
  return `${Math.round(units === "f" ? (c * 9) / 5 + 32 : c)}°`;
}

// ── Colour that reads on the wallpaper ─────────────────────────────────────

/** For "auto" colour: white text on darker wallpapers, near-black on bright ones. */
export function autoInk(luminance: number | null): string {
  return luminance !== null && luminance > 0.62 ? "#15131C" : "#FFFFFF";
}
