import { randomUUID } from "node:crypto";
import { EMPTY_RULES, matches } from "../shared/smart.ts";
import type { Collection, Folder, HistoryEntry, Playlist, RuleTime, ScheduleRule, Settings, SmartRules, Source, Wallpaper } from "../shared/types.ts";
import { tx, type Db } from "./db.ts";

/** Reads and writes the library. Everything is synchronous: SQLite on a local disk is fast. */

type Row = Record<string, unknown>;

const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

function toWallpaper(r: Row): Wallpaper {
  return {
    id: String(r.id),
    path: String(r.path),
    title: String(r.title),
    source: String(r.source) as Source,
    sourceId: str(r.source_id),
    sourceUrl: str(r.source_url),
    credit: str(r.credit),
    folderId: str(r.folder_id),
    width: num(r.width),
    height: num(r.height),
    bytes: num(r.bytes),
    hash: String(r.hash),
    colors: JSON.parse(String(r.colors)) as string[],
    accent: String(r.accent),
    luminance: num(r.luminance),
    favourite: !!num(r.favourite),
    addedAt: num(r.added_at),
    lastShownAt: r.last_shown_at === null ? null : num(r.last_shown_at),
    showCount: num(r.show_count),
    missing: !!num(r.missing),
  };
}

export type NewWallpaper = Omit<Wallpaper, "id" | "favourite" | "lastShownAt" | "showCount" | "missing" | "addedAt"> & { addedAt?: number };

export const DEFAULT_SETTINGS: Settings = {
  fit: "fill",
  displayMode: "same",
  displayPlaylists: {},
  launchAtLogin: false,
  startHidden: false,
  closeToTray: true,
  pauseOnBattery: true,
  shortcuts: true,
  location: null,
  scheduleEnabled: true,
  downloadFolder: "",
  wallhavenKey: "",
  liveAccent: true,
  widgetsEnabled: true,
  widgetLayer: "desktop",
};

export class Library {
  db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  // ── Wallpapers ─────────────────────────────────────────────────────────

  wallpapers(): Wallpaper[] {
    return (this.db.prepare("SELECT * FROM wallpapers ORDER BY added_at DESC, rowid DESC").all() as Row[]).map(toWallpaper);
  }

  wallpaper(id: string): Wallpaper | null {
    const r = this.db.prepare("SELECT * FROM wallpapers WHERE id = ?").get(id) as Row | undefined;
    return r ? toWallpaper(r) : null;
  }

  byPath(path: string): Wallpaper | null {
    const r = this.db.prepare("SELECT * FROM wallpapers WHERE path = ?").get(path) as Row | undefined;
    return r ? toWallpaper(r) : null;
  }

  bySource(source: Source, sourceId: string): Wallpaper | null {
    const r = this.db.prepare("SELECT * FROM wallpapers WHERE source = ? AND source_id = ?").get(source, sourceId) as Row | undefined;
    return r ? toWallpaper(r) : null;
  }

  sourceIds(source: Source): Set<string> {
    return new Set((this.db.prepare("SELECT source_id FROM wallpapers WHERE source = ? AND source_id IS NOT NULL").all(source) as Row[]).map((r) => String(r.source_id)));
  }

  add(w: NewWallpaper): Wallpaper {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO wallpapers (id, path, title, source, source_id, source_url, credit, folder_id, width, height, bytes, hash, colors, accent, luminance, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, w.path, w.title, w.source, w.sourceId, w.sourceUrl, w.credit, w.folderId, w.width, w.height, w.bytes, w.hash, JSON.stringify(w.colors), w.accent, w.luminance, w.addedAt ?? Date.now());
    return this.wallpaper(id)!;
  }

  rename(id: string, title: string): void {
    const t = title.trim().slice(0, 120);
    if (t) this.db.prepare("UPDATE wallpapers SET title = ? WHERE id = ?").run(t, id);
  }

  setFavourite(ids: string[], favourite: boolean): void {
    const stmt = this.db.prepare("UPDATE wallpapers SET favourite = ? WHERE id = ?");
    tx(this.db, () => ids.forEach((id) => stmt.run(favourite ? 1 : 0, id)));
  }

  setMissing(id: string, missing: boolean): void {
    this.db.prepare("UPDATE wallpapers SET missing = ? WHERE id = ?").run(missing ? 1 : 0, id);
  }

  /** Re-reads a file that changed on disk (same path, new picture). */
  refresh(id: string, w: Pick<Wallpaper, "width" | "height" | "bytes" | "hash" | "colors" | "accent" | "luminance">): void {
    this.db
      .prepare("UPDATE wallpapers SET width = ?, height = ?, bytes = ?, hash = ?, colors = ?, accent = ?, luminance = ?, missing = 0 WHERE id = ?")
      .run(w.width, w.height, w.bytes, w.hash, JSON.stringify(w.colors), w.accent, w.luminance, id);
  }

  remove(ids: string[]): void {
    const stmt = this.db.prepare("DELETE FROM wallpapers WHERE id = ?");
    tx(this.db, () => ids.forEach((id) => stmt.run(id)));
  }

  // ── History ────────────────────────────────────────────────────────────

  recordShown(wallpaperId: string, displayId: string, playlistId: string | null, at = Date.now()): void {
    tx(this.db, () => {
      this.db.prepare("INSERT INTO history (wallpaper_id, display_id, at, playlist_id) VALUES (?, ?, ?, ?)").run(wallpaperId, displayId, at, playlistId);
      this.db.prepare("UPDATE wallpapers SET last_shown_at = ?, show_count = show_count + 1 WHERE id = ?").run(at, wallpaperId);
      // Keep the latest 1,000 entries.
      this.db.prepare("DELETE FROM history WHERE id <= (SELECT id FROM history ORDER BY id DESC LIMIT 1 OFFSET 1000)").run();
    });
  }

  history(limit = 200): HistoryEntry[] {
    return (this.db.prepare("SELECT * FROM history ORDER BY id DESC LIMIT ?").all(limit) as Row[]).map((r) => ({
      id: num(r.id),
      wallpaperId: String(r.wallpaper_id),
      displayId: String(r.display_id),
      at: num(r.at),
      playlistId: str(r.playlist_id),
    }));
  }

  clearHistory(): void {
    this.db.exec("DELETE FROM history");
  }

  // ── Collections ────────────────────────────────────────────────────────

  collections(): Collection[] {
    const rows = this.db
      .prepare(
        `SELECT c.id, c.name, c.created_at, COUNT(ci.wallpaper_id) AS n
         FROM collections c LEFT JOIN collection_items ci ON ci.collection_id = c.id
         GROUP BY c.id ORDER BY c.name COLLATE NOCASE`,
      )
      .all() as Row[];
    const cover = this.db.prepare(
      "SELECT ci.wallpaper_id FROM collection_items ci JOIN wallpapers w ON w.id = ci.wallpaper_id WHERE ci.collection_id = ? AND w.missing = 0 ORDER BY ci.added_at DESC LIMIT 4",
    );
    return rows.map((r) => ({ id: String(r.id), name: String(r.name), createdAt: num(r.created_at), count: num(r.n), cover: (cover.all(String(r.id)) as Row[]).map((x) => String(x.wallpaper_id)) }));
  }

  createCollection(name: string): string {
    const id = randomUUID();
    this.db.prepare("INSERT INTO collections (id, name, created_at) VALUES (?, ?, ?)").run(id, cleanName(name, "New collection"), Date.now());
    return id;
  }

  renameCollection(id: string, name: string): void {
    this.db.prepare("UPDATE collections SET name = ? WHERE id = ?").run(cleanName(name, "Collection"), id);
  }

  deleteCollection(id: string): void {
    this.db.prepare("DELETE FROM collections WHERE id = ?").run(id);
  }

  addToCollection(id: string, wallpaperIds: string[]): void {
    const stmt = this.db.prepare("INSERT OR IGNORE INTO collection_items (collection_id, wallpaper_id, added_at) VALUES (?, ?, ?)");
    const now = Date.now();
    tx(this.db, () => wallpaperIds.forEach((w, i) => stmt.run(id, w, now + i)));
  }

  removeFromCollection(id: string, wallpaperIds: string[]): void {
    const stmt = this.db.prepare("DELETE FROM collection_items WHERE collection_id = ? AND wallpaper_id = ?");
    tx(this.db, () => wallpaperIds.forEach((w) => stmt.run(id, w)));
  }

  collectionItems(id: string): string[] {
    return (this.db.prepare("SELECT wallpaper_id FROM collection_items WHERE collection_id = ? ORDER BY added_at DESC").all(id) as Row[]).map((r) => String(r.wallpaper_id));
  }

  /** wallpaper id → the collections it's in. */
  membership(): Map<string, Set<string>> {
    const out = new Map<string, Set<string>>();
    for (const r of this.db.prepare("SELECT collection_id, wallpaper_id FROM collection_items").all() as Row[]) {
      const w = String(r.wallpaper_id);
      if (!out.has(w)) out.set(w, new Set());
      out.get(w)!.add(String(r.collection_id));
    }
    return out;
  }

  // ── Playlists ──────────────────────────────────────────────────────────

  playlists(): Playlist[] {
    const rows = this.db.prepare("SELECT * FROM playlists ORDER BY created_at").all() as Row[];
    const items = this.db.prepare("SELECT wallpaper_id FROM playlist_items WHERE playlist_id = ? ORDER BY position");
    const all = rows.some((r) => r.smart) ? this.wallpapers() : [];
    const member = rows.some((r) => r.smart) ? this.membership() : new Map<string, Set<string>>();
    return rows.map((r) => {
      const smart = r.smart ? ({ ...EMPTY_RULES, ...(JSON.parse(String(r.smart)) as SmartRules) } as SmartRules) : null;
      const ids = smart ? all.filter((w) => matches(w, smart, (id) => member.get(id) ?? new Set())).map((w) => w.id) : (items.all(String(r.id)) as Row[]).map((x) => String(x.wallpaper_id));
      return {
        id: String(r.id),
        name: String(r.name),
        createdAt: num(r.created_at),
        interval: num(r.interval),
        shuffle: !!num(r.shuffle),
        matchDaylight: !!num(r.match_daylight),
        smart,
        items: ids,
        cover: ids.slice(0, 4),
      };
    });
  }

  playlist(id: string): Playlist | null {
    return this.playlists().find((p) => p.id === id) ?? null;
  }

  createPlaylist(p: { name: string; smart?: SmartRules | null; items?: string[]; interval?: number; shuffle?: boolean }): string {
    const id = randomUUID();
    tx(this.db, () => {
      this.db
        .prepare("INSERT INTO playlists (id, name, created_at, interval, shuffle, match_daylight, smart) VALUES (?, ?, ?, ?, ?, 0, ?)")
        .run(id, cleanName(p.name, "New playlist"), Date.now(), clampInterval(p.interval ?? 30), p.shuffle === false ? 0 : 1, p.smart ? JSON.stringify(p.smart) : null);
      if (p.items?.length) this.setPlaylistItems(id, p.items);
    });
    return id;
  }

  updatePlaylist(id: string, patch: Partial<Pick<Playlist, "name" | "interval" | "shuffle" | "matchDaylight" | "smart">>): void {
    const sets: string[] = [];
    const args: (string | number | null)[] = [];
    if (patch.name !== undefined) {
      sets.push("name = ?");
      args.push(cleanName(patch.name, "Playlist"));
    }
    if (patch.interval !== undefined) {
      sets.push("interval = ?");
      args.push(clampInterval(patch.interval));
    }
    if (patch.shuffle !== undefined) {
      sets.push("shuffle = ?");
      args.push(patch.shuffle ? 1 : 0);
    }
    if (patch.matchDaylight !== undefined) {
      sets.push("match_daylight = ?");
      args.push(patch.matchDaylight ? 1 : 0);
    }
    if (patch.smart !== undefined) {
      sets.push("smart = ?");
      args.push(patch.smart ? JSON.stringify(patch.smart) : null);
    }
    if (!sets.length) return;
    this.db.prepare(`UPDATE playlists SET ${sets.join(", ")} WHERE id = ?`).run(...args, id);
  }

  deletePlaylist(id: string): void {
    this.db.prepare("DELETE FROM playlists WHERE id = ?").run(id);
  }

  setPlaylistItems(id: string, ids: string[]): void {
    tx(this.db, () => {
      this.db.prepare("DELETE FROM playlist_items WHERE playlist_id = ?").run(id);
      const stmt = this.db.prepare("INSERT OR IGNORE INTO playlist_items (playlist_id, wallpaper_id, position) VALUES (?, ?, ?)");
      [...new Set(ids)].forEach((w, i) => stmt.run(id, w, i));
    });
  }

  addToPlaylist(id: string, ids: string[]): void {
    const current = (this.db.prepare("SELECT wallpaper_id FROM playlist_items WHERE playlist_id = ? ORDER BY position").all(id) as Row[]).map((r) => String(r.wallpaper_id));
    this.setPlaylistItems(id, [...current, ...ids.filter((x) => !current.includes(x))]);
  }

  removeFromPlaylist(id: string, ids: string[]): void {
    const drop = new Set(ids);
    const current = (this.db.prepare("SELECT wallpaper_id FROM playlist_items WHERE playlist_id = ? ORDER BY position").all(id) as Row[]).map((r) => String(r.wallpaper_id));
    this.setPlaylistItems(id, current.filter((x) => !drop.has(x)));
  }

  // ── Schedule ───────────────────────────────────────────────────────────

  rules(): ScheduleRule[] {
    return (this.db.prepare("SELECT * FROM rules ORDER BY position, rowid").all() as Row[]).map((r) => ({
      id: String(r.id),
      days: JSON.parse(String(r.days)) as number[],
      at: JSON.parse(String(r.at)) as RuleTime,
      playlistId: String(r.playlist_id),
      enabled: !!num(r.enabled),
    }));
  }

  saveRule(rule: Omit<ScheduleRule, "id"> & { id?: string }): string {
    const days = [...new Set(rule.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    const at: RuleTime = rule.at.kind === "time" ? { kind: "time", minutes: Math.max(0, Math.min(1439, Math.round(rule.at.minutes))) } : { kind: "sun", event: rule.at.event, offset: Math.max(-240, Math.min(240, Math.round(rule.at.offset))) };
    if (rule.id && this.db.prepare("SELECT 1 FROM rules WHERE id = ?").get(rule.id)) {
      this.db.prepare("UPDATE rules SET days = ?, at = ?, playlist_id = ?, enabled = ? WHERE id = ?").run(JSON.stringify(days), JSON.stringify(at), rule.playlistId, rule.enabled ? 1 : 0, rule.id);
      return rule.id;
    }
    const id = rule.id ?? randomUUID();
    const pos = num((this.db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM rules").get() as Row).p);
    this.db.prepare("INSERT INTO rules (id, days, at, playlist_id, enabled, position) VALUES (?, ?, ?, ?, ?, ?)").run(id, JSON.stringify(days), JSON.stringify(at), rule.playlistId, rule.enabled ? 1 : 0, pos);
    return id;
  }

  deleteRule(id: string): void {
    this.db.prepare("DELETE FROM rules WHERE id = ?").run(id);
  }

  // ── Folders ────────────────────────────────────────────────────────────

  folders(): Folder[] {
    return (
      this.db
        .prepare("SELECT f.*, (SELECT COUNT(*) FROM wallpapers w WHERE w.folder_id = f.id AND w.missing = 0) AS n FROM folders f ORDER BY f.path COLLATE NOCASE")
        .all() as Row[]
    ).map((r) => ({ id: String(r.id), path: String(r.path), recursive: !!num(r.recursive), addedAt: num(r.added_at), count: num(r.n), lastScan: r.last_scan === null ? null : num(r.last_scan), error: str(r.error) }));
  }

  addFolder(path: string, recursive = true): string {
    const existing = this.db.prepare("SELECT id FROM folders WHERE path = ?").get(path) as Row | undefined;
    if (existing) return String(existing.id);
    const id = randomUUID();
    this.db.prepare("INSERT INTO folders (id, path, recursive, added_at) VALUES (?, ?, ?, ?)").run(id, path, recursive ? 1 : 0, Date.now());
    return id;
  }

  folderScanned(id: string, error: string | null): void {
    this.db.prepare("UPDATE folders SET last_scan = ?, error = ? WHERE id = ?").run(Date.now(), error, id);
  }

  /** Stops watching a folder; its pictures leave the library (the files stay on disk). */
  removeFolder(id: string): void {
    tx(this.db, () => {
      this.db.prepare("DELETE FROM wallpapers WHERE folder_id = ?").run(id);
      this.db.prepare("DELETE FROM folders WHERE id = ?").run(id);
    });
  }

  folderWallpapers(id: string): Wallpaper[] {
    return (this.db.prepare("SELECT * FROM wallpapers WHERE folder_id = ?").all(id) as Row[]).map(toWallpaper);
  }

  // ── Settings and small state ───────────────────────────────────────────

  get<T>(key: string, fallback: T): T {
    const r = this.db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as Row | undefined;
    if (!r) return fallback;
    try {
      return JSON.parse(String(r.value)) as T;
    } catch {
      return fallback;
    }
  }

  set(key: string, value: unknown): void {
    this.db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
  }

  settings(): Settings {
    return { ...DEFAULT_SETTINGS, ...this.get<Partial<Settings>>("settings", {}) };
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const next = { ...this.settings(), ...patch };
    this.set("settings", next);
    return next;
  }
}

function cleanName(name: string, fallback: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 60) || fallback;
}

/** Between 1 minute and a week. */
export function clampInterval(minutes: number): number {
  return Number.isFinite(minutes) ? Math.max(1, Math.min(10_080, Math.round(minutes))) : 30;
}
