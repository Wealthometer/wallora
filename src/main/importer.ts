import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { Palette } from "../shared/color.ts";
import type { Source, Wallpaper } from "../shared/types.ts";
import type { Library } from "./library.ts";

/**
 * Bringing pictures into the library: scanning watched folders, importing picked files, and
 * filing downloads. Decoding is injected (Electron's nativeImage in the app, a fake in tests).
 */

export const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".bmp"]);

export type Decoded = { width: number; height: number; palette: Palette; thumb: Buffer };
export type Decoder = (path: string) => Promise<Decoded>;

export function isImage(path: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(path).toLowerCase());
}

export function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha1");
    createReadStream(path)
      .on("data", (c) => h.update(c))
      .on("error", reject)
      .on("end", () => resolve(h.digest("hex")));
  });
}

/** "sunset_over-lagos_4k.jpg" → "Sunset over lagos 4k". */
export function titleFromFile(path: string): string {
  const base = basename(path, extname(path)).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return base ? base[0]!.toUpperCase() + base.slice(1) : "Untitled";
}

async function walk(dir: string, recursive: boolean, out: string[], depth = 0): Promise<void> {
  if (depth > 12) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (depth === 0) throw e;
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (recursive) await walk(full, recursive, out, depth + 1);
    } else if (e.isFile() && isImage(full)) out.push(full);
  }
}

export type ScanResult = { added: Wallpaper[]; missing: number; back: number; failed: { path: string; reason: string }[] };

export class Importer {
  lib: Library;
  decode: Decoder;
  thumbsDir: string;
  constructor(lib: Library, decode: Decoder, thumbsDir: string) {
    this.lib = lib;
    this.decode = decode;
    this.thumbsDir = thumbsDir;
  }

  /** Adds one file in place. Returns the existing wallpaper if this path is already in the library. */
  async addFile(path: string, meta: { source: Source; folderId?: string | null; sourceId?: string | null; sourceUrl?: string | null; credit?: string | null; title?: string }): Promise<Wallpaper> {
    const existing = this.lib.byPath(path);
    if (existing) {
      if (existing.missing) this.lib.setMissing(existing.id, false);
      return this.lib.wallpaper(existing.id)!;
    }
    const [info, hash, decoded] = await Promise.all([stat(path), hashFile(path), this.decode(path)]);
    const w = this.lib.add({
      path,
      title: meta.title ?? titleFromFile(path),
      source: meta.source,
      sourceId: meta.sourceId ?? null,
      sourceUrl: meta.sourceUrl ?? null,
      credit: meta.credit ?? null,
      folderId: meta.folderId ?? null,
      width: decoded.width,
      height: decoded.height,
      bytes: info.size,
      hash,
      colors: decoded.palette.colors,
      accent: decoded.palette.accent,
      luminance: decoded.palette.luminance,
    });
    await mkdir(this.thumbsDir, { recursive: true });
    await writeFile(join(this.thumbsDir, `${w.id}.jpg`), decoded.thumb);
    return w;
  }

  /** Brings a watched folder up to date: new files are added, vanished ones marked missing, returning ones restored. */
  async scanFolder(folderId: string, onProgress?: (done: number, total: number) => void): Promise<ScanResult> {
    const folder = this.lib.folders().find((f) => f.id === folderId);
    if (!folder) throw new Error("That folder isn't in the library any more");
    const result: ScanResult = { added: [], missing: 0, back: 0, failed: [] };
    const files: string[] = [];
    try {
      await walk(folder.path, folder.recursive, files);
    } catch (e) {
      const reason = (e as NodeJS.ErrnoException).code === "ENOENT" ? "The folder doesn't exist any more" : "Wallora can't open this folder";
      this.lib.folderScanned(folderId, reason);
      for (const w of this.lib.folderWallpapers(folderId)) {
        if (w.missing) continue;
        this.lib.setMissing(w.id, true);
        result.missing++;
      }
      return result;
    }
    const onDisk = new Set(files);
    for (const w of this.lib.folderWallpapers(folderId)) {
      if (!onDisk.has(w.path) && !w.missing) {
        this.lib.setMissing(w.id, true);
        result.missing++;
      } else if (onDisk.has(w.path) && w.missing) {
        this.lib.setMissing(w.id, false);
        result.back++;
      }
    }
    const fresh = files.filter((f) => !this.lib.byPath(f));
    let done = 0;
    for (const f of fresh) {
      try {
        result.added.push(await this.addFile(f, { source: "folder", folderId }));
      } catch (e) {
        result.failed.push({ path: f, reason: e instanceof Error ? e.message : String(e) });
      }
      onProgress?.(++done, fresh.length);
    }
    this.lib.folderScanned(folderId, null);
    return result;
  }

  /**
   * Imports picked files by copying them into Wallora's own folder, so they keep working if the
   * originals are moved. Files already in the library (same content) are skipped.
   */
  async importFiles(paths: string[], intoDir: string): Promise<{ added: Wallpaper[]; skipped: number; failed: { path: string; reason: string }[] }> {
    await mkdir(intoDir, { recursive: true });
    const known = new Set(this.lib.wallpapers().map((w) => w.hash));
    const out = { added: [] as Wallpaper[], skipped: 0, failed: [] as { path: string; reason: string }[] };
    for (const p of paths) {
      if (!isImage(p)) {
        out.failed.push({ path: p, reason: "Only JPEG, PNG and BMP pictures can be wallpapers" });
        continue;
      }
      try {
        const hash = await hashFile(p);
        if (known.has(hash)) {
          out.skipped++;
          continue;
        }
        const target = await uniquePath(intoDir, basename(p));
        await copyFile(p, target);
        out.added.push(await this.addFile(target, { source: "import", title: titleFromFile(p) }));
        known.add(hash);
      } catch (e) {
        out.failed.push({ path: p, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    return out;
  }
}

/** "x.jpg", or "x (2).jpg" if that's taken. */
export async function uniquePath(dir: string, name: string): Promise<string> {
  const ext = extname(name);
  const stem = basename(name, ext);
  for (let i = 1; i < 1000; i++) {
    const candidate = join(dir, i === 1 ? name : `${stem} (${i})${ext}`);
    try {
      await stat(candidate);
    } catch {
      return candidate;
    }
  }
  return join(dir, `${stem}-${Date.now()}${ext}`);
}
