import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { net } from "electron";
import { allowedDownload, BING_URL, downloadName, parseBing, parseWallhaven, SourceError, wallhavenUrl, type WallhavenQuery } from "../shared/sources.ts";
import type { OnlinePage, OnlineResult, Wallpaper } from "../shared/types.ts";
import { uniquePath, type Importer } from "./importer.ts";
import type { Library } from "./library.ts";

/** Searching and downloading from Wallhaven and Bing, through Electron's network stack (so system proxies apply). */

const UA = "Wallora/1.0 (desktop wallpaper manager)";
const MAX_BYTES = 80 * 1024 * 1024;

/**
 * Test mode: WALLORA_ONLINE_FIXTURES points at a folder holding wallhaven.json, bing.json and the
 * pictures they mention (by file name), so the browser tests run without the internet.
 */
const FIXTURES = process.env.WALLORA_ONLINE_FIXTURES;

async function fixtureFetch(url: string): Promise<Response> {
  const u = new URL(url);
  const file = u.hostname === "wallhaven.cc" ? "wallhaven.json" : u.pathname.startsWith("/HPImageArchive") ? "bing.json" : decodeURIComponent((u.pathname + u.search).split("/").pop()!.replace(/^th\?id=/, ""));
  const body = await readFile(join(FIXTURES!, file));
  const type = file.endsWith(".json") ? "application/json" : file.endsWith(".png") ? "image/png" : "image/jpeg";
  return new Response(body, { headers: { "content-type": type, "content-length": String(body.byteLength) } });
}

function fetchUrl(url: string, init: RequestInit): Promise<Response> {
  return FIXTURES ? fixtureFetch(url) : net.fetch(url, init);
}

async function getJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchUrl(url, { headers: { "user-agent": UA, accept: "application/json" } });
  } catch {
    throw new SourceError("Couldn't reach the internet. Check your connection and try again.");
  }
  if (res.status === 429) throw new SourceError("Too many searches in a minute. Wait a moment and try again.");
  if (res.status === 401) throw new SourceError("Wallhaven didn't accept the API key in Settings.");
  if (!res.ok) throw new SourceError(`The service answered with an error (${res.status}). Try again later.`);
  return res.json();
}

/** In test mode, thumbnails come from the fixtures folder too. */
function localThumbs(page: OnlinePage): OnlinePage {
  if (!FIXTURES) return page;
  return { ...page, results: page.results.map((r) => ({ ...r, thumb: `wallora-img://fixture/${encodeURIComponent(r.thumb.split("/").pop()!.replace(/^th\?id=/, ""))}` })) };
}

export function fixturesDir(): string | undefined {
  return FIXTURES;
}

export async function searchWallhaven(lib: Library, q: WallhavenQuery): Promise<OnlinePage> {
  const have = lib.sourceIds("wallhaven");
  return localThumbs(parseWallhaven(await getJson(wallhavenUrl(q, lib.settings().wallhavenKey)), (id) => have.has(id)));
}

export async function bingDaily(lib: Library): Promise<OnlinePage> {
  const have = lib.sourceIds("bing");
  return localThumbs(parseBing(await getJson(BING_URL), (id) => have.has(id)));
}

/** Downloads one picture into the download folder and adds it to the library. */
export async function download(lib: Library, importer: Importer, r: OnlineResult, dir: string, onProgress: (done: number, total: number) => void): Promise<Wallpaper> {
  const existing = lib.bySource(r.source, r.sourceId);
  if (existing && !existing.missing) return existing;
  if (!allowedDownload(r.full)) throw new SourceError("Wallora only downloads from Wallhaven and Bing");
  await mkdir(dir, { recursive: true });
  const target = await uniquePath(dir, downloadName(r));
  const part = `${target}.part`;
  let res: Response;
  try {
    res = await fetchUrl(r.full, { headers: { "user-agent": UA } });
  } catch {
    throw new SourceError("The download didn't start. Check your connection.");
  }
  if (!res.ok || !res.body) throw new SourceError(`The download failed (${res.status})`);
  const type = res.headers.get("content-type") ?? "";
  if (!/^image\/(jpeg|png)/.test(type)) throw new SourceError("That link didn't give a JPEG or PNG picture");
  const total = Number(res.headers.get("content-length") ?? 0);
  if (total > MAX_BYTES) throw new SourceError("That picture is too big to download (over 80 MB)");
  const out = createWriteStream(part);
  let done = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      done += value.byteLength;
      if (done > MAX_BYTES) throw new SourceError("That picture is too big to download (over 80 MB)");
      if (!out.write(value)) await new Promise<void>((ok) => out.once("drain", () => ok()));
      onProgress(done, total || done);
    }
    await new Promise<void>((ok, fail) => out.end((e?: Error | null) => (e ? fail(e) : ok())));
    await rename(part, target);
  } catch (e) {
    out.destroy();
    await rm(part, { force: true });
    throw e;
  }
  if (existing) lib.remove([existing.id]);
  return importer.addFile(target, { source: r.source, sourceId: r.sourceId, sourceUrl: r.pageUrl, credit: r.credit, title: r.source === "bing" ? r.title : undefined });
}

export function defaultDownloadDir(pictures: string): string {
  return join(pictures, "Wallora");
}
