import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/main/db.ts";
import { Engine, type Assignment, type Setter } from "../src/main/engine.ts";
import { Importer, titleFromFile, uniquePath, type Decoder } from "../src/main/importer.ts";
import { Library } from "../src/main/library.ts";
import { EMPTY_RULES } from "../src/shared/smart.ts";
import type { DisplayInfo, Settings } from "../src/shared/types.ts";

function lib() {
  return new Library(openDb(":memory:"));
}

let n = 0;
function addPic(l: Library, over: Partial<{ title: string; luminance: number; colors: string[]; width: number; hash: string }> = {}) {
  n++;
  return l.add({
    path: `/pics/${n}.jpg`,
    title: over.title ?? `Pic ${n}`,
    source: "folder",
    sourceId: null,
    sourceUrl: null,
    credit: null,
    folderId: null,
    width: over.width ?? 3840,
    height: 2160,
    bytes: 100,
    hash: over.hash ?? `h${n}`,
    colors: over.colors ?? ["#222222"],
    accent: "#88AAFF",
    luminance: over.luminance ?? 0.3,
  });
}

test("library: wallpapers, collections, playlists (normal and smart), rules, settings", () => {
  const l = lib();
  const a = addPic(l, { title: "Blue lake", colors: ["#1B4F9C"] });
  const b = addPic(l, { title: "Desert", colors: ["#C9772E"], luminance: 0.7 });
  const c = addPic(l);
  assert.equal(l.wallpapers().length, 3);
  l.setFavourite([a.id], true);
  assert.equal(l.wallpaper(a.id)!.favourite, true);

  const col = l.createCollection("  Travel   picks ");
  l.addToCollection(col, [a.id, b.id, a.id]);
  assert.deepEqual(l.collections().map((x) => [x.name, x.count]), [["Travel picks", 2]]);
  l.removeFromCollection(col, [b.id]);
  assert.deepEqual(l.collectionItems(col), [a.id]);

  const pl = l.createPlaylist({ name: "Mix", items: [c.id, a.id, c.id] });
  l.addToPlaylist(pl, [b.id, a.id]);
  assert.deepEqual(l.playlist(pl)!.items, [c.id, a.id, b.id]);
  l.removeFromPlaylist(pl, [a.id]);
  assert.deepEqual(l.playlist(pl)!.items, [c.id, b.id]);
  l.updatePlaylist(pl, { interval: 0, shuffle: false, name: "" });
  assert.deepEqual([l.playlist(pl)!.interval, l.playlist(pl)!.shuffle, l.playlist(pl)!.name], [1, false, "Playlist"]);

  const smart = l.createPlaylist({ name: "Blues", smart: { ...EMPTY_RULES, hues: ["blue"] } });
  assert.deepEqual(l.playlist(smart)!.items, [a.id]);
  const inTravel = l.createPlaylist({ name: "Travel", smart: { ...EMPTY_RULES, collections: [col] } });
  assert.deepEqual(l.playlist(inTravel)!.items, [a.id]);

  // Deleting a wallpaper takes it out of every list.
  l.remove([a.id]);
  assert.deepEqual(l.playlist(smart)!.items, []);
  assert.equal(l.collections()[0]!.count, 0);

  const r = l.saveRule({ days: [5, 1, 1, 9], at: { kind: "time", minutes: 2000 }, playlistId: pl, enabled: true });
  assert.deepEqual(l.rules()[0], { id: r, days: [1, 5], at: { kind: "time", minutes: 1439 }, playlistId: pl, enabled: true });
  l.deletePlaylist(pl);
  assert.equal(l.rules().length, 0, "rules for a deleted playlist go too");

  assert.equal(l.settings().fit, "fill");
  l.updateSettings({ fit: "fit", location: { name: "Lagos", lat: 6.5, lng: 3.4 } });
  assert.deepEqual([l.settings().fit, l.settings().location?.name, l.settings().pauseOnBattery], ["fit", "Lagos", true]);

  l.recordShown(b.id, "1", null, 10);
  l.recordShown(c.id, "1", null, 20);
  assert.deepEqual(l.history().map((h) => h.wallpaperId), [c.id, b.id]);
  assert.equal(l.wallpaper(c.id)!.showCount, 1);
});

const fakeDecode: Decoder = async (path) => ({
  width: path.includes("small") ? 800 : 3840,
  height: 2160,
  palette: { colors: ["#112233", "#AA5500"], weights: [0.7, 0.3], accent: "#FFAA55", luminance: 0.25 },
  thumb: Buffer.from("jpeg"),
});

test("importer: scanning a folder adds pictures, notices deletions and returns, copies imports", async () => {
  const root = mkdtempSync(join(tmpdir(), "wallora-"));
  try {
    const pics = join(root, "Pictures");
    mkdirSync(join(pics, "nested"), { recursive: true });
    writeFileSync(join(pics, "sunset_over-lagos.jpg"), "a");
    writeFileSync(join(pics, "nested", "forest.PNG"), "b");
    writeFileSync(join(pics, "notes.txt"), "not a picture");
    writeFileSync(join(pics, ".hidden.jpg"), "c");
    const l = lib();
    const imp = new Importer(l, fakeDecode, join(root, "thumbs"));
    const folder = l.addFolder(pics, true);
    const first = await imp.scanFolder(folder);
    assert.equal(first.added.length, 2);
    assert.deepEqual(l.wallpapers().map((w) => w.title).sort(), ["Forest", "Sunset over lagos"]);
    assert.equal(l.folders()[0]!.count, 2);

    rmSync(join(pics, "nested", "forest.PNG"));
    const second = await imp.scanFolder(folder);
    assert.deepEqual([second.added.length, second.missing], [0, 1]);
    assert.equal(l.folders()[0]!.count, 1);
    writeFileSync(join(pics, "nested", "forest.PNG"), "b");
    assert.equal((await imp.scanFolder(folder)).back, 1);

    // Imports are copied; the same content isn't imported twice.
    const outside = join(root, "elsewhere");
    mkdirSync(outside);
    writeFileSync(join(outside, "beach.jpg"), "beach");
    writeFileSync(join(outside, "readme.md"), "x");
    const into = join(root, "Wallora");
    const res = await imp.importFiles([join(outside, "beach.jpg"), join(outside, "readme.md"), join(pics, "sunset_over-lagos.jpg")], into);
    assert.equal(res.added.length, 1);
    assert.equal(res.skipped, 1);
    assert.match(res.failed[0]!.reason, /JPEG, PNG and BMP/);
    assert.ok(res.added[0]!.path.startsWith(into));
    assert.equal(await uniquePath(into, "beach.jpg"), join(into, "beach (2).jpg"));

    // Removing the folder removes its pictures from the library, not from disk.
    l.removeFolder(folder);
    assert.equal(l.wallpapers().length, 1);

    rmSync(pics, { recursive: true });
    const gone = l.addFolder(pics);
    await imp.scanFolder(gone);
    assert.equal(l.folders().find((f) => f.id === gone)!.error, "The folder doesn't exist any more");
    assert.equal(titleFromFile("C:/x/my_wallpaper-4K.jpeg"), "My wallpaper 4K");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

class FakeSetter implements Setter {
  name = "fake";
  perDisplay = true;
  calls: Assignment[][] = [];
  fail = false;
  async set(a: Assignment[], _s: Settings, _d: DisplayInfo[]) {
    if (this.fail) throw new Error("desktop said no");
    this.calls.push(a);
  }
}

const D1: DisplayInfo = { id: "1", label: "Main", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, pixels: { width: 1920, height: 1080 }, primary: true };
const D2: DisplayInfo = { id: "2", label: "Side", bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, pixels: { width: 1920, height: 1080 }, primary: false };

function rig(displays = [D1]) {
  const l = lib();
  const setter = new FakeSetter();
  let now = new Date(2026, 10, 3, 8, 0).getTime();
  const changes: number[] = [];
  const errors: string[] = [];
  const engine = new Engine({ lib: l, setter, displays: () => displays, now: () => now, rng: () => 0.3, onChange: () => changes.push(now), onError: (m) => errors.push(m) });
  return { l, setter, engine, errors, advance: (min: number) => (now += min * 60_000), at: (h: number, m = 0) => (now = new Date(2026, 10, 3, h, m).getTime()) };
}

test("engine: plays the library, changes when due, previous goes back, pause holds", async () => {
  const { l, setter, engine, advance } = rig();
  const pics = [addPic(l), addPic(l), addPic(l)];
  await engine.start();
  assert.equal(setter.calls.length, 1, "something shows straight away");
  assert.equal(setter.calls[0]![0]!.display, null, "one picture on all displays by default");
  const first = engine.nowPlaying();
  assert.equal(first.reason, "library");
  const shown1 = first.current["1"]!;

  advance(10);
  await engine.tick();
  assert.equal(setter.calls.length, 1, "not due yet (library changes every 30 min)");
  advance(21);
  await engine.tick();
  assert.equal(setter.calls.length, 2);
  const shown2 = engine.nowPlaying().current["1"]!;
  assert.notEqual(shown2, shown1);

  await engine.previous();
  assert.equal(engine.nowPlaying().current["1"], shown1);

  await engine.setPlaying(false);
  advance(120);
  await engine.tick();
  assert.equal(setter.calls.length, 3, "paused: nothing changes");
  assert.equal(engine.nowPlaying().pausedReason, "user");
  assert.equal(pics.length, 3);
});

test("engine: schedule rules take over, a hand-picked playlist lasts until the next rule", async () => {
  const { l, setter, engine, at } = rig();
  const day = [addPic(l), addPic(l)];
  const night = [addPic(l), addPic(l)];
  const dayPl = l.createPlaylist({ name: "Day", items: day.map((w) => w.id), interval: 60 });
  const nightPl = l.createPlaylist({ name: "Night", items: night.map((w) => w.id), interval: 60 });
  l.saveRule({ days: [0, 1, 2, 3, 4, 5, 6], at: { kind: "time", minutes: 7 * 60 }, playlistId: dayPl, enabled: true });
  l.saveRule({ days: [0, 1, 2, 3, 4, 5, 6], at: { kind: "time", minutes: 19 * 60 }, playlistId: nightPl, enabled: true });

  at(8);
  await engine.start();
  assert.equal(engine.nowPlaying().playlistName, "Day");
  assert.equal(engine.nowPlaying().reason, "schedule");
  assert.ok(day.some((w) => w.id === engine.nowPlaying().current["1"]));
  assert.equal(engine.nowPlaying().scheduleNext?.playlistName, "Night");

  at(12);
  await engine.play(nightPl);
  assert.equal(engine.nowPlaying().reason, "manual");
  assert.ok(night.some((w) => w.id === engine.nowPlaying().current["1"]));

  // At 19:00 the schedule takes back over (with Night, as it happens), and at 07:00 Day starts.
  at(19, 1);
  await engine.tick();
  assert.equal(engine.nowPlaying().reason, "schedule");
  const calls = setter.calls.length;
  at(23, 59);
  await engine.tick();
  assert.equal(setter.calls.length, calls + 1, "hourly change");
});

test("engine: different pictures per display, per-display playlists, failures retry", async () => {
  const { l, setter, engine, errors, advance } = rig([D1, D2]);
  const a = addPic(l);
  const b = addPic(l);
  const c = addPic(l);
  l.updateSettings({ displayMode: "different" });
  await engine.start();
  const last = setter.calls.at(-1)!;
  assert.equal(last.length, 2);
  assert.notEqual(last[0]!.path, last[1]!.path);

  const only = l.createPlaylist({ name: "Side only", items: [c.id] });
  l.updateSettings({ displayMode: "perDisplay", displayPlaylists: { "2": only } });
  await engine.tick(); // settings changed: switches now
  const np = engine.nowPlaying();
  assert.equal(np.current["2"], c.id);
  assert.ok([a.id, b.id].includes(np.current["1"]!));

  setter.fail = true;
  advance(31);
  await engine.next();
  assert.deepEqual(errors, ["desktop said no"]);
  setter.fail = false;
  advance(1);
  await engine.tick();
  assert.equal(errors.length, 1);
  assert.ok(setter.calls.length >= 3, "retried a minute later");

  // Showing one wallpaper on one display keeps the other.
  await engine.show(a.id, "2");
  const shown = setter.calls.at(-1)!;
  assert.equal(shown.find((x) => x.display?.id === "2")!.path, a.path);
});

test("engine: an empty library does nothing, and battery pause is reported", async () => {
  const { setter, engine } = rig();
  await engine.start();
  assert.equal(setter.calls.length, 0);
  assert.equal(engine.nowPlaying().nextAt, null);

  const l2 = lib();
  addPic(l2);
  const s = new FakeSetter();
  const e = new Engine({ lib: l2, setter: s, displays: () => [D1], onBattery: () => true });
  await e.start();
  assert.equal(s.calls.length, 0);
  assert.equal(e.nowPlaying().pausedReason, "battery");
  e.stop();
  engine.stop();
});
