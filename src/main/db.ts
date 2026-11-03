import { DatabaseSync } from "node:sqlite";

/**
 * Wallora's library lives in one SQLite file (Node's built-in driver, so there's no native module
 * to rebuild for Electron). Migrations run in order and are recorded in user_version.
 */

const MIGRATIONS: string[] = [
  `CREATE TABLE wallpapers (
     id TEXT PRIMARY KEY,
     path TEXT NOT NULL UNIQUE,
     title TEXT NOT NULL,
     source TEXT NOT NULL,
     source_id TEXT,
     source_url TEXT,
     credit TEXT,
     folder_id TEXT,
     width INTEGER NOT NULL,
     height INTEGER NOT NULL,
     bytes INTEGER NOT NULL,
     hash TEXT NOT NULL,
     colors TEXT NOT NULL,
     accent TEXT NOT NULL,
     luminance REAL NOT NULL,
     favourite INTEGER NOT NULL DEFAULT 0,
     added_at INTEGER NOT NULL,
     last_shown_at INTEGER,
     show_count INTEGER NOT NULL DEFAULT 0,
     missing INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX wallpapers_hash ON wallpapers(hash);
   CREATE UNIQUE INDEX wallpapers_source ON wallpapers(source, source_id) WHERE source_id IS NOT NULL;
   CREATE INDEX wallpapers_folder ON wallpapers(folder_id);

   CREATE TABLE collections (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
   CREATE TABLE collection_items (
     collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
     wallpaper_id TEXT NOT NULL REFERENCES wallpapers(id) ON DELETE CASCADE,
     added_at INTEGER NOT NULL,
     PRIMARY KEY (collection_id, wallpaper_id)
   );

   CREATE TABLE playlists (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     interval INTEGER NOT NULL,
     shuffle INTEGER NOT NULL,
     match_daylight INTEGER NOT NULL,
     smart TEXT
   );
   CREATE TABLE playlist_items (
     playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
     wallpaper_id TEXT NOT NULL REFERENCES wallpapers(id) ON DELETE CASCADE,
     position INTEGER NOT NULL,
     PRIMARY KEY (playlist_id, wallpaper_id)
   );

   CREATE TABLE rules (
     id TEXT PRIMARY KEY,
     days TEXT NOT NULL,
     at TEXT NOT NULL,
     playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
     enabled INTEGER NOT NULL,
     position INTEGER NOT NULL
   );

   CREATE TABLE folders (
     id TEXT PRIMARY KEY,
     path TEXT NOT NULL UNIQUE,
     recursive INTEGER NOT NULL,
     added_at INTEGER NOT NULL,
     last_scan INTEGER,
     error TEXT
   );

   CREATE TABLE history (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     wallpaper_id TEXT NOT NULL REFERENCES wallpapers(id) ON DELETE CASCADE,
     display_id TEXT NOT NULL,
     at INTEGER NOT NULL,
     playlist_id TEXT
   );
   CREATE INDEX history_at ON history(at);

   CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

export type Db = DatabaseSync;

export function openDb(file: string): Db {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  for (let v = version; v < MIGRATIONS.length; v++) {
    tx(db, () => {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

let depth = 0;
/** Runs `fn` in a transaction (nested calls join the outer one). */
export function tx<T>(db: Db, fn: () => T): T {
  if (depth > 0) return fn();
  depth++;
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    depth--;
  }
}
