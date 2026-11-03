import { EMPTY_QUEUE, nextUp, preview, type QueueState } from "../shared/queue.ts";
import { activeRule, nextStart } from "../shared/schedule.ts";
import { daylight } from "../shared/sun.ts";
import type { DisplayInfo, NowPlaying, Playlist, Settings, Wallpaper } from "../shared/types.ts";
import type { Library } from "./library.ts";

/**
 * The player: decides which playlist is in charge (one you picked, the schedule, or the whole
 * library), changes the wallpaper when it's due, and keeps "previous" working.
 */

export type Assignment = { display: DisplayInfo | null; path: string };

export interface Setter {
  readonly name: string;
  /** Can this desktop show a different picture on each display? */
  readonly perDisplay: boolean;
  set(assignments: Assignment[], settings: Settings, displays: DisplayInfo[]): Promise<void>;
}

type PlayerState = {
  playing: boolean;
  manualPlaylistId: string | null;
  /** A playlist picked by hand plays until the next schedule rule starts. */
  manualUntil: number | null;
  queues: Record<string, QueueState>;
  current: Record<string, string>;
  back: Record<string, string[]>;
  lastPlaylistKey: string | null;
  lastChangeAt: number | null;
  nextAt: number | null;
};

const INITIAL: PlayerState = { playing: true, manualPlaylistId: null, manualUntil: null, queues: {}, current: {}, back: {}, lastPlaylistKey: null, lastChangeAt: null, nextAt: null };
const LIBRARY_ID = "__library__";
const ALL = "*";

export type EngineDeps = {
  lib: Library;
  setter: Setter;
  displays: () => DisplayInfo[];
  now?: () => number;
  rng?: () => number;
  onBattery?: () => boolean;
  onChange?: (np: NowPlaying) => void;
  onError?: (message: string) => void;
};

type Resolved = { playlist: Playlist; reason: NowPlaying["reason"] };

export class Engine {
  private d: Required<Omit<EngineDeps, "onChange" | "onError">> & Pick<EngineDeps, "onChange" | "onError">;
  private state: PlayerState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy: Promise<unknown> = Promise.resolve();

  constructor(deps: EngineDeps) {
    this.d = { now: Date.now, rng: Math.random, onBattery: () => false, ...deps };
    this.state = { ...INITIAL, ...this.d.lib.get<Partial<PlayerState>>("player", {}) };
  }

  private save() {
    this.d.lib.set("player", this.state);
  }

  // ── Which playlist ─────────────────────────────────────────────────────

  private libraryPlaylist(): Playlist {
    const ids = this.d.lib
      .wallpapers()
      .filter((w) => !w.missing)
      .map((w) => w.id);
    return { id: LIBRARY_ID, name: "Your library", createdAt: 0, interval: 30, shuffle: true, matchDaylight: false, smart: null, items: ids, cover: ids.slice(0, 4) };
  }

  private resolve(settings: Settings, now: number): Resolved {
    const playlists = this.d.lib.playlists();
    const s = this.state;
    if (s.manualPlaylistId) {
      const p = playlists.find((x) => x.id === s.manualPlaylistId);
      if (p && (s.manualUntil === null || now < s.manualUntil)) return { playlist: p, reason: "manual" };
    }
    if (settings.scheduleEnabled) {
      const active = activeRule(this.d.lib.rules(), new Date(now), settings.location);
      const p = active && playlists.find((x) => x.id === active.rule.playlistId);
      if (p) return { playlist: p, reason: "schedule" };
    }
    return { playlist: this.libraryPlaylist(), reason: "library" };
  }

  private pool(p: Playlist, byId: Map<string, Wallpaper>): string[] {
    return p.items.filter((id) => {
      const w = byId.get(id);
      return w && !w.missing;
    });
  }

  // ── Changing ───────────────────────────────────────────────────────────

  /** Runs one change or check at a time, in order. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.busy.then(fn, fn);
    this.busy = run.catch(() => undefined);
    return run;
  }

  private async apply(chosen: Map<string, string>, settings: Settings, playlistId: string | null, now: number, displays: DisplayInfo[], pushBack = true): Promise<boolean> {
    const lib = this.d.lib;
    const assignments: Assignment[] = [];
    const sameEverywhere = chosen.has(ALL);
    if (sameEverywhere) {
      const w = lib.wallpaper(chosen.get(ALL)!);
      if (!w) return false;
      assignments.push({ display: null, path: w.path });
    } else {
      for (const d of displays) {
        const id = chosen.get(d.id);
        const w = id ? lib.wallpaper(id) : null;
        if (w) assignments.push({ display: d, path: w.path });
      }
    }
    if (!assignments.length) return false;
    try {
      await this.d.setter.set(assignments, settings, displays);
    } catch (e) {
      this.d.onError?.(e instanceof Error ? e.message : String(e));
      this.state.nextAt = now + 60_000;
      this.save();
      return false;
    }
    const targets = sameEverywhere ? displays.map((d) => d.id) : [...chosen.keys()];
    for (const displayId of targets) {
      const id = sameEverywhere ? chosen.get(ALL)! : chosen.get(displayId)!;
      const prev = this.state.current[displayId];
      if (pushBack && prev && prev !== id) this.state.back[displayId] = [...(this.state.back[displayId] ?? []), prev].slice(-30);
      this.state.current[displayId] = id;
      lib.recordShown(id, displayId, playlistId === LIBRARY_ID ? null : playlistId, now);
    }
    this.state.lastChangeAt = now;
    return true;
  }

  private daylightFor(p: Playlist, settings: Settings, now: number, byId: Map<string, Wallpaper>) {
    return p.matchDaylight ? { target: daylight(new Date(now), settings.location), luminance: (id: string) => byId.get(id)?.luminance ?? 0.5 } : undefined;
  }

  /** Picks and shows the next wallpaper(s) from whatever is in charge now. */
  private async advance(now: number): Promise<boolean> {
    const settings = this.d.lib.settings();
    const displays = this.d.displays();
    const byId = new Map(this.d.lib.wallpapers().map((w) => [w.id, w]));
    const mode = this.d.setter.perDisplay ? settings.displayMode : "same";
    const global = this.resolve(settings, now);
    const chosen = new Map<string, string>();
    let interval = global.playlist.interval;

    const pick = (p: Playlist, key: string, exclude?: Set<string>) => {
      const r = nextUp(this.pool(p, byId), this.state.queues[key] ?? EMPTY_QUEUE, { shuffle: p.shuffle, rng: this.d.rng, exclude, daylight: this.daylightFor(p, settings, now, byId) });
      if (r) this.state.queues[key] = r.state;
      return r?.id ?? null;
    };

    if (mode === "same" || displays.length <= 1) {
      const id = pick(global.playlist, global.playlist.id);
      if (id) chosen.set(ALL, id);
    } else if (mode === "different") {
      const used = new Set<string>();
      for (const d of displays) {
        const id = pick(global.playlist, global.playlist.id, used);
        if (id) {
          chosen.set(d.id, id);
          used.add(id);
        }
      }
    } else {
      const playlists = this.d.lib.playlists();
      const used = new Set<string>();
      for (const d of displays) {
        const own = playlists.find((p) => p.id === settings.displayPlaylists[d.id]) ?? global.playlist;
        interval = Math.min(interval, own.interval);
        const id = pick(own, `${own.id}@${d.id}`, used);
        if (id) {
          chosen.set(d.id, id);
          used.add(id);
        }
      }
    }

    this.state.lastPlaylistKey = this.playlistKey(global, settings);
    if (!chosen.size) {
      this.state.nextAt = null;
      this.save();
      this.emit();
      return false;
    }
    const ok = await this.apply(chosen, settings, global.playlist.id, now, displays);
    if (ok) this.state.nextAt = now + interval * 60_000;
    this.save();
    this.emit();
    return ok;
  }

  private playlistKey(r: Resolved, settings: Settings): string {
    return `${r.playlist.id}|${settings.displayMode}|${JSON.stringify(settings.displayPlaylists)}`;
  }

  /** Called on a timer and whenever something relevant changes: changes the wallpaper if it's due. */
  tick(): Promise<void> {
    return this.serial(async () => {
      const now = this.d.now();
      const s = this.state;
      const settings = this.d.lib.settings();
      if (s.manualPlaylistId && s.manualUntil !== null && now >= s.manualUntil) {
        s.manualPlaylistId = null;
        s.manualUntil = null;
      }
      const paused = !s.playing || (settings.pauseOnBattery && this.d.onBattery());
      const key = this.playlistKey(this.resolve(settings, now), settings);
      const switched = s.lastPlaylistKey !== null && key !== s.lastPlaylistKey;
      if (!paused && (switched || s.nextAt === null || now >= s.nextAt)) await this.advance(now);
      else this.emit();
    }).finally(() => this.arm());
  }

  /** Sleeps until the next change is due (checking at least once a minute, for schedule rules and the clock). */
  private arm() {
    if (this.timer) clearTimeout(this.timer);
    const now = this.d.now();
    const due = this.state.nextAt ? this.state.nextAt - now : 60_000;
    this.timer = setTimeout(() => void this.tick(), Math.max(1000, Math.min(60_000, due)));
    (this.timer as { unref?: () => void }).unref?.();
  }

  start(): Promise<void> {
    return this.tick();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  // ── Controls ───────────────────────────────────────────────────────────

  next(): Promise<boolean> {
    return this.serial(() => this.advance(this.d.now())).finally(() => this.arm());
  }

  /** Goes back to what was showing before on each display. */
  previous(): Promise<boolean> {
    return this.serial(async () => {
      const now = this.d.now();
      const settings = this.d.lib.settings();
      const displays = this.d.displays();
      const chosen = new Map<string, string>();
      for (const d of displays) {
        const stack = this.state.back[d.id] ?? [];
        while (stack.length) {
          const id = stack.pop()!;
          const w = this.d.lib.wallpaper(id);
          if (w && !w.missing) {
            chosen.set(d.id, id);
            break;
          }
        }
        this.state.back[d.id] = stack;
      }
      if (!chosen.size) return false;
      const ids = new Set(chosen.values());
      const same = ids.size === 1 && chosen.size === displays.length ? new Map([[ALL, [...ids][0]!]]) : chosen;
      const ok = await this.apply(same, settings, null, now, displays, false);
      if (ok) this.state.nextAt = now + this.resolve(settings, now).playlist.interval * 60_000;
      this.save();
      this.emit();
      return ok;
    }).finally(() => this.arm());
  }

  /** Shows one wallpaper now, on one display or all of them. The playlist carries on from there later. */
  show(wallpaperId: string, displayId: string | null): Promise<boolean> {
    return this.serial(async () => {
      const now = this.d.now();
      const settings = this.d.lib.settings();
      const displays = this.d.displays();
      const chosen = new Map<string, string>();
      if (displayId === null || !this.d.setter.perDisplay) chosen.set(ALL, wallpaperId);
      else {
        // Keep what the other displays have.
        for (const d of displays) chosen.set(d.id, d.id === displayId ? wallpaperId : (this.state.current[d.id] ?? wallpaperId));
      }
      const ok = await this.apply(chosen, settings, null, now, displays);
      if (ok) this.state.nextAt = now + this.resolve(settings, now).playlist.interval * 60_000;
      this.save();
      this.emit();
      return ok;
    }).finally(() => this.arm());
  }

  /** Plays a playlist now. It stays in charge until the next schedule rule starts. */
  play(playlistId: string | null): Promise<boolean> {
    const now = this.d.now();
    const settings = this.d.lib.settings();
    this.state.playing = true;
    this.state.manualPlaylistId = playlistId;
    const next = settings.scheduleEnabled ? nextStart(this.d.lib.rules(), new Date(now), settings.location) : null;
    this.state.manualUntil = next ? next.at.getTime() : null;
    this.save();
    return this.next();
  }

  /** Lets the schedule decide again. */
  followSchedule(): Promise<void> {
    this.state.manualPlaylistId = null;
    this.state.manualUntil = null;
    this.save();
    return this.tick();
  }

  setPlaying(playing: boolean): Promise<void> {
    this.state.playing = playing;
    if (playing && this.state.nextAt !== null && this.state.nextAt < this.d.now()) this.state.nextAt = this.d.now() + 5_000;
    this.save();
    return this.tick();
  }

  /** Drops queue state for playlists that changed, so edits take effect at the next change. */
  forget(wallpaperIds: string[]): void {
    const drop = new Set(wallpaperIds);
    for (const k of Object.keys(this.state.queues)) {
      const q = this.state.queues[k]!;
      this.state.queues[k] = { lastId: q.lastId && drop.has(q.lastId) ? null : q.lastId, bag: q.bag.filter((id) => !drop.has(id)) };
    }
    for (const k of Object.keys(this.state.back)) this.state.back[k] = this.state.back[k]!.filter((id) => !drop.has(id));
    this.save();
  }

  // ── Reporting ──────────────────────────────────────────────────────────

  nowPlaying(): NowPlaying {
    const now = this.d.now();
    const settings = this.d.lib.settings();
    const r = this.resolve(settings, now);
    const byId = new Map(this.d.lib.wallpapers().map((w) => [w.id, w]));
    const upNext = preview(this.pool(r.playlist, byId), this.state.queues[r.playlist.id] ?? EMPTY_QUEUE, { shuffle: r.playlist.shuffle, rng: () => 0.5, daylight: this.daylightFor(r.playlist, settings, now, byId) }, 8);
    const ns = settings.scheduleEnabled ? nextStart(this.d.lib.rules(), new Date(now), settings.location) : null;
    const nsPlaylist = ns ? this.d.lib.playlists().find((p) => p.id === ns.rule.playlistId) : null;
    const battery = settings.pauseOnBattery && this.d.onBattery();
    const current: Record<string, string> = {};
    for (const d of this.d.displays()) if (this.state.current[d.id] && byId.has(this.state.current[d.id]!)) current[d.id] = this.state.current[d.id]!;
    return {
      playing: this.state.playing && !battery,
      pausedReason: !this.state.playing ? "user" : battery ? "battery" : null,
      playlistId: r.playlist.id === LIBRARY_ID ? null : r.playlist.id,
      playlistName: r.playlist.name,
      reason: r.reason,
      current,
      nextAt: this.state.playing && !battery ? this.state.nextAt : null,
      lastChangeAt: this.state.lastChangeAt,
      upNext,
      scheduleNext: ns && nsPlaylist && nsPlaylist.id !== r.playlist.id ? { at: ns.at.getTime(), playlistName: nsPlaylist.name } : null,
    };
  }

  private emit() {
    this.d.onChange?.(this.nowPlaying());
  }
}
