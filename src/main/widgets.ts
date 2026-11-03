import { BrowserWindow, screen, net } from "electron";
import { randomUUID } from "node:crypto";
import { readFile, statfs } from "node:fs/promises";
import { cpus, freemem, homedir, totalmem, uptime } from "node:os";
import { join, parse } from "node:path";
import type { OverlayState, WidgetPatch } from "../shared/api.ts";
import type { NowPlaying } from "../shared/types.ts";
import {
  WIDGET_KINDS,
  applyTheme,
  clampPosition,
  cleanOptions,
  cleanStyle,
  cpuPercent,
  newWidget,
  parseWeather,
  weatherUrl,
  type AnyWidget,
  type CpuTimes,
  type SystemStats,
  type Weather,
  type WidgetKind,
} from "../shared/widgets.ts";
import type { Library } from "./library.ts";

type Deps = {
  lib: Library;
  now: () => NowPlaying;
  preload: string;
  /** Loads the widget page into a window (dev server or built file). */
  load: (w: BrowserWindow, displayId: string) => void;
  /** Windows only: push a window under every other window. */
  sendToBottom?: (hwnd: string) => Promise<void>;
  /** Folder of canned answers for tests (weather.json). */
  fixtures: string | null;
  onChange: () => void;
};

function cpuTimes(): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const c of cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  return { idle, total };
}

function hwndString(buf: Buffer): string {
  return buf.length >= 8 ? buf.readBigUInt64LE(0).toString() : String(buf.readUInt32LE(0));
}

/**
 * Keeps the widget list and one transparent window per display that has widgets. The windows sit
 * on the desktop: click-through, out of the taskbar, under other windows (on Windows by pushing
 * them to the bottom of the stack, on macOS and Linux with the "desktop" window type). While
 * editing they come to the front so widgets can be dragged into place.
 */
export class Widgets {
  private d: Deps;
  private windows = new Map<string, BrowserWindow>();
  private editing = false;
  private lastCpu: CpuTimes | null = null;
  private statsTimer: NodeJS.Timeout | null = null;
  private weatherCache: Weather | null = null;
  private weatherPending: Promise<Weather | null> | null = null;
  private latestStats: SystemStats | null = null;
  private restackTimer: NodeJS.Timeout | null = null;

  constructor(d: Deps) {
    this.d = d;
  }

  list(): AnyWidget[] {
    const raw = this.d.lib.get<AnyWidget[]>("widgets", []);
    return Array.isArray(raw) ? raw.filter((w) => w && WIDGET_KINDS.some((k) => k.kind === w.kind)) : [];
  }

  private save(list: AnyWidget[]) {
    this.d.lib.set("widgets", list);
    this.d.onChange();
    this.sync();
  }

  isEditing(): boolean {
    return this.editing;
  }

  add(kind: WidgetKind, display: string): string {
    if (!WIDGET_KINDS.some((k) => k.kind === kind)) throw new Error("Unknown widget");
    const list = this.list();
    const w = newWidget(kind, randomUUID(), display, list) as AnyWidget;
    this.save([...list, w]);
    return w.id;
  }

  update(id: string, patch: WidgetPatch) {
    const list = this.list().map((w) => {
      if (w.id !== id) return w;
      const pos = clampPosition(patch.x ?? w.x, patch.y ?? w.y);
      return {
        ...w,
        ...pos,
        display: typeof patch.display === "string" ? patch.display.slice(0, 64) : w.display,
        style: patch.style ? cleanStyle({ ...w.style, ...patch.style }, w.style) : w.style,
        options: patch.options ? cleanOptions(w.kind, { ...w.options, ...patch.options }, w.options as never) : w.options,
      } as AnyWidget;
    });
    this.save(list);
  }

  remove(id: string) {
    this.save(this.list().filter((w) => w.id !== id));
  }

  duplicate(id: string): string {
    const list = this.list();
    const w = list.find((x) => x.id === id);
    if (!w) throw new Error("That widget is gone");
    const copy = { ...w, id: randomUUID(), ...clampPosition(w.x + 0.03, w.y + 0.04) } as AnyWidget;
    this.save([...list, copy]);
    return copy.id;
  }

  theme(themeId: string) {
    this.save(applyTheme(this.list(), themeId));
  }

  setEditing(on: boolean) {
    if (this.editing === on) return;
    this.editing = on;
    // Window type and focusability can't change on a live window, so they're rebuilt.
    for (const w of this.windows.values()) w.destroy();
    this.windows.clear();
    this.d.onChange();
    this.sync();
  }

  // ── Windows ──────────────────────────────────────────────────────────────

  /** Creates, moves or closes widget windows to match the settings, widgets and displays. */
  sync() {
    const s = this.d.lib.settings();
    const all = this.list();
    const displays = screen.getAllDisplays();
    const wanted = new Set<string>();
    if (s.widgetsEnabled || this.editing) {
      for (const d of displays) {
        const id = String(d.id);
        if (this.editing || all.some((w) => w.display === id)) wanted.add(id);
      }
    }
    for (const [id, w] of this.windows) {
      if (!wanted.has(id) || w.isDestroyed()) {
        if (!w.isDestroyed()) w.destroy();
        this.windows.delete(id);
      }
    }
    for (const d of displays) {
      const id = String(d.id);
      if (!wanted.has(id)) continue;
      const area = d.workArea;
      let w = this.windows.get(id);
      if (!w) {
        w = this.create(id, area, s.widgetLayer);
        this.windows.set(id, w);
      } else {
        w.setBounds(area);
      }
    }
    this.pushState();
    this.updateStatsTimer();
    // On Windows, "Show desktop" (Win+D) and some full-screen apps reorder windows; re-pinning
    // every few seconds brings the widgets back the way Rainmeter does. It's a 1 ms call.
    const pin = process.platform === "win32" && !this.editing && s.widgetLayer === "desktop" && this.windows.size > 0;
    if (pin && !this.restackTimer) this.restackTimer = setInterval(() => this.restack(), 3000);
    if (!pin && this.restackTimer) {
      clearInterval(this.restackTimer);
      this.restackTimer = null;
    }
  }

  private create(displayId: string, area: Electron.Rectangle, layer: "desktop" | "top"): BrowserWindow {
    const editing = this.editing;
    const onDesktop = !editing && layer === "desktop";
    const w = new BrowserWindow({
      ...area,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      focusable: editing,
      alwaysOnTop: editing || layer === "top",
      title: "Wallora widgets",
      ...(onDesktop && process.platform !== "win32" ? { type: "desktop" } : {}),
      webPreferences: { preload: this.d.preload, contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false },
    });
    if (!editing) w.setIgnoreMouseEvents(true);
    if (process.platform === "darwin") w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    w.webContents.on("will-navigate", (e) => e.preventDefault());
    w.once("ready-to-show", () => {
      if (w.isDestroyed()) return;
      if (editing) {
        w.show();
        w.focus();
      } else {
        w.showInactive();
        if (onDesktop && process.platform === "win32") void this.d.sendToBottom?.(hwndString(w.getNativeWindowHandle())).catch(() => undefined);
      }
    });
    this.d.load(w, displayId);
    return w;
  }

  /** Re-stacks the desktop windows under everything (after a display change, say). */
  restack() {
    if (process.platform !== "win32" || this.editing || this.d.lib.settings().widgetLayer !== "desktop") return;
    for (const w of this.windows.values()) if (!w.isDestroyed()) void this.d.sendToBottom?.(hwndString(w.getNativeWindowHandle())).catch(() => undefined);
  }

  windowFor(sender: Electron.WebContents): string | null {
    for (const [id, w] of this.windows) if (!w.isDestroyed() && w.webContents === sender) return id;
    return null;
  }

  isOverlay(sender: Electron.WebContents): boolean {
    return this.windowFor(sender) !== null;
  }

  overlayState(displayId: string): OverlayState {
    const d = screen.getAllDisplays().find((x) => String(x.id) === displayId) ?? screen.getPrimaryDisplay();
    const np = this.d.now();
    const wid = np.current[displayId] ?? Object.values(np.current)[0];
    const w = wid ? this.d.lib.wallpaper(wid) : null;
    const loc = this.d.lib.settings().location;
    return {
      display: { id: displayId, width: d.workArea.width, height: d.workArea.height },
      widgets: this.list().filter((x) => x.display === displayId),
      wallpaper: w ? { id: w.id, title: w.title, colors: w.colors, accent: w.accent, luminance: w.luminance } : null,
      playlistName: np.playlistName,
      nextAt: np.nextAt,
      location: loc?.name ?? null,
      editing: this.editing,
    };
  }

  /** Sends every widget window its latest state (after a wallpaper change, say). */
  pushState() {
    for (const [id, w] of this.windows) if (!w.isDestroyed()) w.webContents.send("wallora:overlay", this.overlayState(id));
  }

  closeAll() {
    for (const w of this.windows.values()) if (!w.isDestroyed()) w.destroy();
    this.windows.clear();
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    if (this.restackTimer) clearInterval(this.restackTimer);
    this.restackTimer = null;
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  async stats(): Promise<SystemStats> {
    const next = cpuTimes();
    const cpu = cpuPercent(this.lastCpu, next) ?? this.latestStats?.cpu ?? null;
    this.lastCpu = next;
    let disk: SystemStats["disk"] = null;
    try {
      const fsInfo = await statfs(parse(homedir()).root || "/");
      const total = fsInfo.blocks * fsInfo.bsize;
      disk = { total, used: total - fsInfo.bavail * fsInfo.bsize };
    } catch {
      // Not available on this system.
    }
    this.latestStats = { cpu, memory: { total: totalmem(), used: totalmem() - freemem() }, disk, uptime: uptime() };
    return this.latestStats;
  }

  /** Samples every 2 seconds, only while a stats widget is showing or being edited. */
  private updateStatsTimer() {
    const need = this.list().some((w) => w.kind === "stats") && (this.windows.size > 0 || this.editing);
    if (need && !this.statsTimer) {
      const tick = async () => {
        const s = await this.stats();
        for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send("wallora:stats", s);
      };
      void tick();
      this.statsTimer = setInterval(() => void tick(), 2000);
    } else if (!need && this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  // ── Weather ──────────────────────────────────────────────────────────────

  /** Current weather for the location in Settings, cached for 20 minutes. Null without a location. */
  async weather(): Promise<Weather | null> {
    const loc = this.d.lib.settings().location;
    if (!loc) return null;
    const fresh = this.weatherCache && this.weatherCache.place === loc.name && Date.now() - this.weatherCache.at < 20 * 60_000;
    if (fresh) return this.weatherCache;
    this.weatherPending ??= (async () => {
      try {
        let json: unknown;
        if (this.d.fixtures) json = JSON.parse(await readFile(join(this.d.fixtures, "weather.json"), "utf8"));
        else {
          const res = await net.fetch(weatherUrl(loc.lat, loc.lng), { headers: { "user-agent": "Wallora" } });
          if (!res.ok) throw new Error(`Weather service answered ${res.status}`);
          json = await res.json();
        }
        this.weatherCache = parseWeather(json, loc.name, Date.now());
        return this.weatherCache;
      } catch {
        return this.weatherCache;
      } finally {
        this.weatherPending = null;
      }
    })();
    return this.weatherPending;
  }
}
