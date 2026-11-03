import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun, type LucideIcon } from "lucide-react";
import type { OverlayState } from "../../shared/api.ts";
import {
  FONTS,
  autoInk,
  clockParts,
  countdownText,
  daysUntil,
  formatBytes,
  formatUptime,
  greeting,
  monthGrid,
  temperature,
  timeInWords,
  weatherLabel,
  weekdayInitials,
  type AnyWidget,
  type SystemStats,
  type Weather,
  type Widget,
} from "../../shared/widgets.ts";

export type WidgetCtx = {
  now: Date;
  wallpaper: OverlayState["wallpaper"];
  playlistName: string | null;
  nextAt: number | null;
  stats: SystemStats | null;
  weather: Weather | null;
  battery: { level: number; charging: boolean } | null;
  location: string | null;
};

const WEATHER_ICONS: Record<ReturnType<typeof weatherLabel>["icon"], LucideIcon> = {
  sun: Sun,
  moon: Moon,
  "cloud-sun": CloudSun,
  "cloud-moon": CloudMoon,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

function ink(w: AnyWidget, ctx: WidgetCtx): string {
  return w.style.color === "auto" ? autoInk(ctx.wallpaper?.luminance ?? null) : w.style.color;
}

function accentOf(ctx: WidgetCtx): string {
  return ctx.wallpaper?.accent ?? "#A89BFF";
}

// ── Faces ──────────────────────────────────────────────────────────────────

function Clock({ w, ctx }: { w: Widget<"clock">; ctx: WidgetCtx }) {
  const o = w.options;
  const p = clockParts(ctx.now, o);
  const dateLine = ctx.now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const hello = o.greeting ? <div className="w-greet">{greeting(ctx.now)}</div> : null;
  switch (o.face) {
    case "stacked":
      return (
        <div className="w-clock stacked">
          {hello}
          <div className="w-big">{p.hours}</div>
          <div className="w-big w-accent">{p.minutes}</div>
          {o.showDate ? <div className="w-sub">{dateLine}</div> : null}
        </div>
      );
    case "words":
      return (
        <div className="w-clock words">
          {hello}
          <div className="w-words">
            It's <b>{timeInWords(ctx.now)}</b>
          </div>
          {o.showDate ? <div className="w-sub">{dateLine}</div> : null}
        </div>
      );
    case "analog": {
      const h = ctx.now.getHours() % 12;
      const m = ctx.now.getMinutes();
      const s = ctx.now.getSeconds();
      return (
        <div className="w-clock analog">
          {hello}
          <svg viewBox="0 0 200 200" className="w-dial" aria-label={`${p.hours}:${p.minutes}`}>
            <circle cx="100" cy="100" r="94" className="w-face" />
            {Array.from({ length: 60 }, (_, i) => (
              <line key={i} x1="100" y1={i % 5 ? 12 : 10} x2="100" y2={i % 5 ? 17 : 26} transform={`rotate(${i * 6} 100 100)`} className={i % 5 ? "w-tick" : "w-tick big"} />
            ))}
            <line x1="100" y1="100" x2="100" y2="52" className="w-hand hour" transform={`rotate(${h * 30 + m / 2} 100 100)`} />
            <line x1="100" y1="100" x2="100" y2="30" className="w-hand min" transform={`rotate(${m * 6 + s / 10} 100 100)`} />
            {o.seconds ? <line x1="100" y1="114" x2="100" y2="24" className="w-hand sec" style={{ stroke: accentOf(ctx) }} transform={`rotate(${s * 6} 100 100)`} /> : null}
            <circle cx="100" cy="100" r="5" style={{ fill: accentOf(ctx) }} />
          </svg>
          {o.showDate ? <div className="w-sub">{dateLine}</div> : null}
        </div>
      );
    }
    case "neon":
      return (
        <div className="w-clock neon" style={{ "--glow": w.style.color === "auto" ? accentOf(ctx) : w.style.color } as CSSProperties}>
          {hello}
          <div className="w-big">
            {p.hours}
            <span className="w-blink">:</span>
            {p.minutes}
            {o.seconds ? <span className="w-sec">{p.seconds}</span> : null}
          </div>
          {o.showDate ? <div className="w-sub">{dateLine}</div> : null}
        </div>
      );
    case "minimal":
      return (
        <div className="w-clock minimal">
          {hello}
          <span className="w-mid">
            {p.hours}:{p.minutes}
            {o.seconds ? `:${p.seconds}` : ""} {p.period}
          </span>
          {o.showDate ? <span className="w-sub"> · {ctx.now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span> : null}
        </div>
      );
    default:
      return (
        <div className="w-clock classic">
          {hello}
          <div className="w-big">
            {p.hours}:{p.minutes}
            {o.seconds || p.period ? (
              <span className="w-after">
                {p.period ? <span>{p.period}</span> : null}
                {o.seconds ? <span className="w-accent">{p.seconds}</span> : null}
              </span>
            ) : null}
          </div>
          {o.showDate ? <div className="w-sub">{dateLine}</div> : null}
        </div>
      );
  }
}

function DateFace({ w, ctx }: { w: Widget<"date">; ctx: WidgetCtx }) {
  const d = ctx.now;
  if (w.options.format === "short") return <div className="w-mid">{d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</div>;
  if (w.options.format === "weekday")
    return (
      <div className="w-date weekday">
        <div className="w-caps">{d.toLocaleDateString(undefined, { weekday: "long" })}</div>
        <div className="w-big">{d.getDate()}</div>
        <div className="w-sub">{d.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
      </div>
    );
  return (
    <div className="w-date">
      <div className="w-mid strong">{d.toLocaleDateString(undefined, { weekday: "long" })}</div>
      <div className="w-sub">{d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</div>
    </div>
  );
}

function Calendar({ w, ctx }: { w: Widget<"calendar">; ctx: WidgetCtx }) {
  const d = ctx.now;
  const weeks = monthGrid(d.getFullYear(), d.getMonth(), w.options.weekStart);
  return (
    <div className="w-cal">
      <div className="w-cal-head">
        <b>{d.toLocaleDateString(undefined, { month: "long" })}</b> <span className="w-dim">{d.getFullYear()}</span>
      </div>
      <div className="w-cal-grid">
        {weekdayInitials(w.options.weekStart).map((l, i) => (
          <span key={`h${i}`} className="w-dim">
            {l}
          </span>
        ))}
        {weeks.flat().map((n, i) => (
          <span key={i} className={n === d.getDate() ? "today" : ""} style={n === d.getDate() ? { background: accentOf(ctx), color: autoInk(0.9) } : undefined}>
            {n ?? ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function Meter({ label, value, frac, color }: { label: string; value: string; frac: number | null; color: string }) {
  return (
    <div className="w-meter">
      <div className="w-meter-row">
        <span className="w-dim">{label}</span>
        <span className="w-num">{value}</span>
      </div>
      <div className="w-track">
        <i style={{ width: `${Math.round(Math.min(1, Math.max(0, frac ?? 0)) * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function Stats({ w, ctx }: { w: Widget<"stats">; ctx: WidgetCtx }) {
  const s = ctx.stats;
  const o = w.options;
  const a = accentOf(ctx);
  return (
    <div className="w-stats">
      {o.cpu ? <Meter label="CPU" value={s?.cpu === null || !s ? "…" : `${s.cpu}%`} frac={s?.cpu === null || !s ? 0 : s.cpu / 100} color={a} /> : null}
      {o.memory ? <Meter label="Memory" value={s ? `${formatBytes(s.memory.used)} / ${formatBytes(s.memory.total)}` : "…"} frac={s ? s.memory.used / s.memory.total : 0} color={a} /> : null}
      {o.disk && s?.disk ? <Meter label="Disk" value={`${formatBytes(s.disk.total - s.disk.used)} free`} frac={s.disk.used / s.disk.total} color={a} /> : null}
      {o.battery && ctx.battery ? <Meter label={ctx.battery.charging ? "Battery · charging" : "Battery"} value={`${Math.round(ctx.battery.level * 100)}%`} frac={ctx.battery.level} color={ctx.battery.level < 0.2 && !ctx.battery.charging ? "#FF6B81" : a} /> : null}
      {o.uptime && s ? (
        <div className="w-meter-row">
          <span className="w-dim">Up for</span>
          <span className="w-num">{formatUptime(s.uptime)}</span>
        </div>
      ) : null}
    </div>
  );
}

function WeatherFace({ w, ctx }: { w: Widget<"weather">; ctx: WidgetCtx }) {
  const x = ctx.weather;
  if (!x) return <div className="w-sub">{ctx.location ? "Getting the weather…" : "Set your city in Wallora's Settings to see the weather"}</div>;
  const l = weatherLabel(x.code, x.isDay);
  const I = WEATHER_ICONS[l.icon];
  return (
    <div className="w-weather">
      <div className="w-weather-now">
        <I className="w-wicon" style={{ color: accentOf(ctx) }} />
        <span className="w-big">{temperature(x.temp, w.options.units)}</span>
      </div>
      <div className="w-mid strong">{l.text}</div>
      <div className="w-sub">
        {x.place}
        {w.options.showRange && x.max !== null && x.min !== null ? ` · ${temperature(x.max, w.options.units)} / ${temperature(x.min, w.options.units)}` : ""}
      </div>
    </div>
  );
}

function Note({ w }: { w: Widget<"note"> }) {
  return <div className="w-note">{w.options.text || "Write something in Wallora"}</div>;
}

function Countdown({ w, ctx }: { w: Widget<"countdown">; ctx: WidgetCtx }) {
  const t = countdownText(daysUntil(ctx.now, w.options.date), w.options.label);
  return (
    <div className="w-count">
      <div className="w-big">{t.big}</div>
      <div className="w-sub">{t.small}</div>
    </div>
  );
}

function NowPlayingFace({ w, ctx }: { w: Widget<"nowplaying">; ctx: WidgetCtx }) {
  const wp = ctx.wallpaper;
  return (
    <div className="w-np">
      <div className="w-caps w-dim">On your desktop</div>
      <div className="w-mid strong">{wp?.title ?? "Nothing yet"}</div>
      {ctx.playlistName ? <div className="w-sub">from {ctx.playlistName}</div> : null}
      {w.options.palette && wp ? (
        <div className="w-dots">
          {wp.colors.slice(0, 5).map((c, i) => (
            <i key={i} style={{ background: c }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WidgetFace({ w, ctx }: { w: AnyWidget; ctx: WidgetCtx }) {
  switch (w.kind) {
    case "clock":
      return <Clock w={w} ctx={ctx} />;
    case "date":
      return <DateFace w={w} ctx={ctx} />;
    case "calendar":
      return <Calendar w={w} ctx={ctx} />;
    case "stats":
      return <Stats w={w} ctx={ctx} />;
    case "weather":
      return <WeatherFace w={w} ctx={ctx} />;
    case "note":
      return <Note w={w} />;
    case "countdown":
      return <Countdown w={w} ctx={ctx} />;
    case "nowplaying":
      return <NowPlayingFace w={w} ctx={ctx} />;
  }
}

export function widgetStyle(w: AnyWidget, ctx: WidgetCtx): CSSProperties {
  const color = ink(w, ctx);
  return {
    fontFamily: FONTS.find((f) => f.id === w.style.font)?.css,
    color,
    opacity: w.style.opacity,
    fontSize: `${16 * w.style.scale}px`,
    textAlign: w.style.align,
    "--ink": color,
    "--accent-w": accentOf(ctx),
  } as CSSProperties;
}

// ── A layer of widgets at their places ─────────────────────────────────────

export function WidgetLayer({
  widgets,
  width,
  height,
  ctx,
  editing = false,
  scale = 1,
  selected = null,
  onSelect,
  onMove,
  testId,
}: {
  widgets: AnyWidget[];
  width: number;
  height: number;
  ctx: WidgetCtx;
  editing?: boolean;
  /** How much the layer is shrunk on screen (for previews), so drags move the right amount. */
  scale?: number;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, x: number, y: number) => void;
  testId?: string;
}) {
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const start = useRef<{ id: string; px: number; py: number; x: number; y: number } | null>(null);

  const down = (e: ReactPointerEvent, w: AnyWidget) => {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(w.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { id: w.id, px: e.clientX, py: e.clientY, x: w.x, y: w.y };
  };
  const move = (e: ReactPointerEvent) => {
    const s = start.current;
    if (!s) return;
    const x = Math.min(0.98, Math.max(0, s.x + (e.clientX - s.px) / scale / width));
    const y = Math.min(0.98, Math.max(0, s.y + (e.clientY - s.py) / scale / height));
    setDrag({ id: s.id, x, y });
  };
  const up = () => {
    const s = start.current;
    start.current = null;
    if (s && drag && drag.id === s.id && (drag.x !== s.x || drag.y !== s.y)) onMove?.(s.id, drag.x, drag.y);
    setDrag(null);
  };

  return (
    <div className={`w-layer${editing ? " editing" : ""}`} style={{ width, height }} data-testid={testId} onPointerDown={() => editing && onSelect?.(null)}>
      {widgets.map((w) => {
        const pos = drag?.id === w.id ? drag : w;
        return (
          <div
            key={w.id}
            className={`widget panel-${w.style.panel}${w.style.shadow ? " shadowed" : ""}${selected === w.id ? " selected" : ""}`}
            style={{ left: pos.x * width, top: pos.y * height, ...widgetStyle(w, ctx) }}
            onPointerDown={(e) => down(e, w)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            data-testid={`widget-${w.kind}`}
            data-widget-id={w.id}
          >
            <WidgetFace w={w} ctx={ctx} />
          </div>
        );
      })}
    </div>
  );
}

// ── Live data for widgets ──────────────────────────────────────────────────

type Bridgeish = {
  weather(): Promise<Weather | null>;
  stats(): Promise<SystemStats>;
  on(event: "stats", cb: (s: SystemStats) => void): () => void;
};

/** The clock tick, system stats, weather and battery, fetched only if some widget shows them. */
export function useWidgetData(api: Bridgeish, widgets: AnyWidget[], location: string | null) {
  const needSeconds = widgets.some((w) => w.kind === "clock" && (w.options.seconds || w.options.face === "analog" || w.options.face === "neon"));
  const needStats = widgets.some((w) => w.kind === "stats");
  const needWeather = widgets.some((w) => w.kind === "weather");
  const needBattery = widgets.some((w) => w.kind === "stats" && w.options.battery);
  const [now, setNow] = useState(() => new Date());
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [battery, setBattery] = useState<WidgetCtx["battery"]>(null);

  useEffect(() => {
    // Tick on the second (or the minute) so the clock never shows a stale time.
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      t = setTimeout(tick, needSeconds ? 1000 - d.getMilliseconds() + 5 : 60_000 - d.getSeconds() * 1000 - d.getMilliseconds() + 5);
    };
    tick();
    return () => clearTimeout(t);
  }, [needSeconds]);

  useEffect(() => {
    if (!needStats) return;
    void api.stats().then(setStats);
    return api.on("stats", setStats);
  }, [api, needStats]);

  useEffect(() => {
    if (!needWeather) return;
    let alive = true;
    const load = () => void api.weather().then((w) => alive && setWeather(w));
    load();
    const t = setInterval(load, 10 * 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [api, needWeather, location]);

  useEffect(() => {
    if (!needBattery) return;
    const nav = navigator as Navigator & { getBattery?: () => Promise<EventTarget & { level: number; charging: boolean }> };
    if (!nav.getBattery) return;
    let b: (EventTarget & { level: number; charging: boolean }) | null = null;
    // Desktops without a battery report "charging, 100%" forever; that's hidden.
    const read = () => b && setBattery(b.charging && b.level >= 1 ? null : { level: b.level, charging: b.charging });
    void nav.getBattery().then((x) => {
      b = x;
      read();
      x.addEventListener("levelchange", read);
      x.addEventListener("chargingchange", read);
    });
    return () => {
      b?.removeEventListener("levelchange", read);
      b?.removeEventListener("chargingchange", read);
    };
  }, [needBattery]);

  return { now, stats, weather, battery };
}
