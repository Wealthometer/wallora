import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPalette, fromHex, hueOf, inkOn, toHex, toHsl, uiAccent } from "../src/shared/color.ts";
import { arrangement, matchMonitors, resolutionLabel, sharpness } from "../src/shared/displays.ts";
import { EMPTY_QUEUE, nextUp, preview, seeded, type QueueState } from "../src/shared/queue.ts";
import { activeRule, describeDays, describeTime, nextStart, parseTime, weekBlocks } from "../src/shared/schedule.ts";
import { EMPTY_RULES, duplicates, matches, search, sortWallpapers } from "../src/shared/smart.ts";
import { allowedDownload, downloadName, parseBing, parseWallhaven, splitCopyright, wallhavenUrl, DEFAULT_WALLHAVEN } from "../src/shared/sources.ts";
import { daylight, sunAltitude, sunTimes } from "../src/shared/sun.ts";
import type { DisplayInfo, ScheduleRule, Wallpaper } from "../src/shared/types.ts";
import { encodePowerShell, kdeScript, macScript, psQuote, windowsSetScript, gnomeCommands, detectLinuxDesktop } from "../src/main/setters/scripts.ts";

// ── Colour ─────────────────────────────────────────────────────────────────

function image(regions: [string, number][], size = 64): Uint8Array {
  // Horizontal stripes of colour in the given proportions, RGBA.
  const px = new Uint8Array(size * size * 4);
  let row = 0;
  for (const [hex, share] of regions) {
    const rows = Math.round(size * share);
    const [r, g, b] = fromHex(hex);
    for (let y = row; y < Math.min(size, row + rows); y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        px[i] = r;
        px[i + 1] = g;
        px[i + 2] = b;
        px[i + 3] = 255;
      }
    row += rows;
  }
  return px;
}

test("palette: dominant colours in order, accent from the most colourful real part", () => {
  const p = extractPalette(image([["#10141F", 0.6], ["#F2A33A", 0.25], ["#2E6FD8", 0.15]]));
  assert.equal(p.colors.length, 3);
  assert.equal(p.colors[0], "#10141F");
  assert.equal(hueOf(p.colors[1]!), "orange");
  assert.ok(p.weights[0]! > 0.55 && p.weights[0]! < 0.65);
  assert.equal(hueOf(p.accent), "orange");
  assert.ok(p.luminance < 0.4, "a mostly dark picture is dark");
  // Same pixels, same palette.
  assert.deepEqual(extractPalette(image([["#10141F", 0.6], ["#F2A33A", 0.25], ["#2E6FD8", 0.15]])), p);
  // BGRA input gives the same answer.
  const rgba = image([["#E5484D", 1]]);
  const bgra = new Uint8Array(rgba);
  for (let i = 0; i < bgra.length; i += 4) [bgra[i], bgra[i + 2]] = [rgba[i + 2]!, rgba[i]!];
  assert.deepEqual(extractPalette(bgra, { bgra: true }).colors, extractPalette(rgba).colors);
  // A grey picture has no colourful accent; a fallback is used.
  assert.equal(extractPalette(image([["#777777", 1]])).accent, "#A89BFF");
  assert.equal(extractPalette(new Uint8Array(0)).colors[0], "#000000");
});

test("colour helpers", () => {
  assert.equal(toHex([255, 128, 0]), "#FF8000");
  assert.deepEqual(fromHex("#abc"), [170, 187, 204]);
  assert.equal(Math.round(toHsl(fromHex("#3E63DD"))[0]), 226);
  assert.equal(hueOf("#3E63DD"), "blue");
  assert.equal(hueOf("#0A0A0A"), "neutral");
  assert.equal(hueOf("#D6409F"), "pink");
  const [, s, l] = toHsl(fromHex(uiAccent("#202A10")));
  assert.ok(s >= 0.54 && l >= 0.59 && l <= 0.75);
  assert.equal(inkOn("#FFE66D"), "#0B0B10");
  assert.equal(inkOn("#3B1F7A"), "#FFFFFF");
});

// ── Sun and schedule ───────────────────────────────────────────────────────

const near = (a: Date | null, iso: string, minutes = 3) => {
  assert.ok(a, `expected a time near ${iso}`);
  assert.ok(Math.abs(a.getTime() - new Date(iso).getTime()) <= minutes * 60_000, `${a.toISOString()} vs ${iso}`);
};

test("sun times match published almanac values", () => {
  // London, midsummer: sunrise 04:43 BST, sunset 21:21 BST.
  const london = sunTimes(new Date(2026, 5, 21), 51.5074, -0.1278);
  near(london.sunrise, "2026-06-21T03:43:00Z");
  near(london.sunset, "2026-06-21T20:21:00Z");
  // Lagos, 3 November: sunrise about 06:35 WAT, sunset about 18:26 WAT.
  const lagos = sunTimes(new Date(2026, 10, 3), 6.5244, 3.3792);
  near(lagos.sunrise, "2026-11-03T05:35:00Z", 4);
  near(lagos.sunset, "2026-11-03T17:26:00Z", 4);
  assert.ok(lagos.dawn! < lagos.sunrise! && lagos.dusk! > lagos.sunset!);
  // Midnight sun in Tromsø: no sunset.
  assert.equal(sunTimes(new Date(2026, 5, 21), 69.65, 18.96).sunset, null);
  assert.ok(sunAltitude(new Date("2026-06-21T12:00:00Z"), 51.5, 0) > 60);
  assert.ok(sunAltitude(new Date("2026-06-21T00:00:00Z"), 51.5, 0) < 0);
  assert.equal(daylight(new Date("2026-06-21T12:00:00Z"), { lat: 51.5, lng: 0 }), 1);
  assert.equal(daylight(new Date("2026-06-21T23:30:00Z"), { lat: 51.5, lng: 0 }), 0);
  assert.equal(daylight(new Date(2026, 0, 1, 13), null), 1);
  assert.equal(daylight(new Date(2026, 0, 1, 2), null), 0);
});

const rule = (id: string, days: number[], minutes: number, playlistId: string): ScheduleRule => ({ id, days, at: { kind: "time", minutes }, playlistId, enabled: true });

test("schedule: the latest rule to start is in charge, across days and weeks", () => {
  const rules = [rule("work", [1, 2, 3, 4, 5], 9 * 60, "focus"), rule("eve", [0, 1, 2, 3, 4, 5, 6], 19 * 60, "calm"), rule("sat", [6], 10 * 60, "weekend")];
  // Tuesday 3 November 2026.
  assert.equal(activeRule(rules, new Date(2026, 10, 3, 10, 0), null)?.rule.id, "work");
  assert.equal(activeRule(rules, new Date(2026, 10, 3, 8, 59), null)?.rule.id, "eve"); // still last night's
  assert.equal(activeRule(rules, new Date(2026, 10, 3, 19, 0), null)?.rule.id, "eve");
  assert.equal(activeRule(rules, new Date(2026, 10, 7, 12, 0), null)?.rule.id, "sat"); // Saturday midday
  assert.equal(activeRule(rules, new Date(2026, 10, 8, 9, 30), null)?.rule.id, "eve"); // Sunday: Saturday evening's rule carries on
});

test("schedule: next change, sun rules, disabled rules, week blocks", () => {
  const rules = [rule("work", [1, 2, 3, 4, 5], 9 * 60, "focus"), rule("eve", [0, 1, 2, 3, 4, 5, 6], 19 * 60, "calm")];
  const next = nextStart(rules, new Date(2026, 10, 3, 10, 0), null)!;
  assert.equal(next.rule.id, "eve");
  assert.equal(next.at.getHours(), 19);
  assert.equal(nextStart(rules, new Date(2026, 10, 6, 20, 0), null)!.at.getDay(), 6); // Fri night → Sat 19:00

  const lagos = { name: "Lagos", lat: 6.5244, lng: 3.3792 };
  const sun: ScheduleRule = { id: "sun", days: [0, 1, 2, 3, 4, 5, 6], at: { kind: "sun", event: "sunset", offset: -30 }, playlistId: "golden", enabled: true };
  const s = nextStart([sun], new Date(2026, 10, 3, 6, 0), lagos)!;
  near(s.at, "2026-11-03T16:53:00Z", 6);
  assert.equal(nextStart([sun], new Date(2026, 10, 3, 6, 0), null), null, "sun rules need a location");
  assert.equal(activeRule([{ ...rules[0]!, enabled: false }], new Date(2026, 10, 3, 10), null), null);

  const week = weekBlocks(rules, new Date(2026, 10, 2), null); // Monday
  assert.equal(week.length, 7);
  const monday = week[0]!;
  assert.deepEqual(monday.map((b) => [b.playlistId, b.from, b.to]), [["calm", 0, 540], ["focus", 540, 1140], ["calm", 1140, 1440]]);
  assert.deepEqual(week[5]!.map((b) => b.playlistId), ["calm"]); // Saturday: evening rule carries all day
});

test("schedule text", () => {
  assert.equal(describeDays([1, 2, 3, 4, 5]), "Weekdays");
  assert.equal(describeDays([6, 0]), "Weekends");
  assert.equal(describeDays([0, 1, 2, 3, 4, 5, 6]), "Every day");
  assert.equal(describeDays([1, 3]), "Mon, Wed");
  assert.equal(describeTime({ kind: "time", minutes: 7 * 60 + 5 }), "07:05");
  assert.equal(describeTime({ kind: "sun", event: "sunset", offset: -60 }), "1 h before sunset");
  assert.equal(describeTime({ kind: "sun", event: "sunrise", offset: 0 }), "At sunrise");
  assert.equal(parseTime("7:30"), 450);
  assert.equal(parseTime("24:00"), null);
});

// ── Queue ──────────────────────────────────────────────────────────────────

test("queue: in order wraps; shuffle plays everything once before repeating, never twice in a row", () => {
  const pool = ["a", "b", "c", "d"];
  let s: QueueState = EMPTY_QUEUE;
  const order: string[] = [];
  for (let i = 0; i < 6; i++) {
    const r = nextUp(pool, s, { shuffle: false, rng: seeded(1) })!;
    order.push(r.id);
    s = r.state;
  }
  assert.deepEqual(order, ["a", "b", "c", "d", "a", "b"]);

  const rng = seeded(42);
  s = EMPTY_QUEUE;
  const played: string[] = [];
  for (let i = 0; i < 40; i++) {
    const r = nextUp(pool, s, { shuffle: true, rng })!;
    played.push(r.id);
    s = r.state;
  }
  for (let round = 0; round < 10; round++) assert.deepEqual([...played.slice(round * 4, round * 4 + 4)].sort(), pool, `round ${round}`);
  for (let i = 1; i < played.length; i++) assert.notEqual(played[i], played[i - 1]);

  // Items removed from the playlist drop out of the bag; an empty playlist gives nothing.
  const r = nextUp(["c"], { lastId: "a", bag: ["b", "c"] }, { shuffle: true, rng })!;
  assert.equal(r.id, "c");
  assert.equal(nextUp([], EMPTY_QUEUE, { shuffle: true, rng }), null);
});

test("queue: different picture per display, daylight matching, preview doesn't change state", () => {
  const pool = ["a", "b", "c"];
  const first = nextUp(pool, EMPTY_QUEUE, { shuffle: false, rng: seeded(1) })!;
  const second = nextUp(pool, first.state, { shuffle: false, rng: seeded(1), exclude: new Set([first.id]) })!;
  assert.notEqual(second.id, first.id);

  const lum: Record<string, number> = { day1: 0.8, day2: 0.75, night1: 0.1, night2: 0.15 };
  const light = (target: number) => ({ target, luminance: (id: string) => lum[id]! });
  const all = Object.keys(lum);
  let s: QueueState = EMPTY_QUEUE;
  const night: string[] = [];
  for (let i = 0; i < 4; i++) {
    const r = nextUp(all, s, { shuffle: true, rng: seeded(i + 3), daylight: light(0.05) })!;
    night.push(r.id);
    s = r.state;
  }
  assert.ok(night.every((id) => id.startsWith("night")), night.join());
  const noon = nextUp(all, s, { shuffle: false, rng: seeded(1), daylight: light(0.9) })!;
  assert.ok(noon.id.startsWith("day"));

  const state = { lastId: "a", bag: [] };
  assert.deepEqual(preview(pool, state, { shuffle: false, rng: seeded(1) }, 5), ["b", "c", "a"]);
  assert.deepEqual(state, { lastId: "a", bag: [] });
});

// ── Library filtering ──────────────────────────────────────────────────────

function wp(id: string, over: Partial<Wallpaper> = {}): Wallpaper {
  return {
    id,
    path: `/pics/${id}.jpg`,
    title: id,
    source: "folder",
    sourceId: null,
    sourceUrl: null,
    credit: null,
    folderId: null,
    width: 3840,
    height: 2160,
    bytes: 1,
    hash: id,
    colors: ["#10141F"],
    accent: "#A89BFF",
    luminance: 0.2,
    favourite: false,
    addedAt: 0,
    lastShownAt: null,
    showCount: 0,
    missing: false,
    ...over,
  };
}

test("smart rules, sorting, duplicates and search", () => {
  const ocean = wp("ocean", { colors: ["#1B4F9C", "#E8F1FA"], luminance: 0.62, favourite: true });
  const dune = wp("Dune at dusk", { colors: ["#C9772E"], luminance: 0.4, width: 1920 });
  const gone = wp("gone", { missing: true });
  const none = () => new Set<string>();
  assert.ok(matches(ocean, { ...EMPTY_RULES, hues: ["blue"], tone: "light" }, none));
  assert.ok(!matches(dune, { ...EMPTY_RULES, hues: ["blue"] }, none));
  assert.ok(!matches(dune, { ...EMPTY_RULES, minWidth: 2560 }, none));
  assert.ok(!matches(dune, { ...EMPTY_RULES, favouritesOnly: true }, none));
  assert.ok(!matches(gone, EMPTY_RULES, none), "missing files never play");
  assert.ok(matches(dune, { ...EMPTY_RULES, collections: ["c1"] }, () => new Set(["c1"])));
  assert.deepEqual(sortWallpapers([dune, ocean], "brightness").map((w) => w.id), ["ocean", "Dune at dusk"]);
  assert.deepEqual(duplicates([wp("x", { hash: "h" }), wp("y", { hash: "h", addedAt: 5 }), wp("z")]).map((g) => g.map((w) => w.id)), [["x", "y"]]);
  assert.deepEqual(search([ocean, dune], "dune").map((w) => w.id), ["Dune at dusk"]);
  assert.deepEqual(search([ocean, dune], "blue").map((w) => w.id), ["ocean"], "colour names are searchable");
});

// ── Online sources ─────────────────────────────────────────────────────────

test("Wallhaven: safe-only search URL and parsing", () => {
  const url = new URL(wallhavenUrl({ ...DEFAULT_WALLHAVEN, q: " mountains ", color: "#0066cc", page: 2 }, "KEY"));
  assert.equal(url.origin + url.pathname, "https://wallhaven.cc/api/v1/search");
  assert.equal(url.searchParams.get("q"), "mountains");
  assert.equal(url.searchParams.get("purity"), "100");
  assert.equal(url.searchParams.get("colors"), "0066cc");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("topRange"), "1M");
  assert.equal(url.searchParams.get("apikey"), "KEY");

  const page = parseWallhaven(
    {
      data: [
        { id: "94x38z", url: "https://wallhaven.cc/w/94x38z", purity: "sfw", dimension_x: 3840, dimension_y: 2160, file_type: "image/jpeg", colors: ["#336600"], path: "https://w.wallhaven.cc/full/94/wallhaven-94x38z.jpg", thumbs: { large: "https://th.wallhaven.cc/lg/94/94x38z.jpg" } },
        { id: "nsfw01", url: "x", purity: "nsfw", dimension_x: 1, dimension_y: 1, file_type: "image/png", path: "https://w.wallhaven.cc/full/x.png", thumbs: {} },
      ],
      meta: { current_page: 2, last_page: 9, total: 210, seed: null },
    },
    (id) => id === "94x38z",
  );
  assert.equal(page.results.length, 1);
  assert.deepEqual([page.page, page.lastPage, page.total], [2, 9, 210]);
  const r = page.results[0]!;
  assert.deepEqual([r.width, r.have, r.colors[0], r.thumb], [3840, true, "#336600", "https://th.wallhaven.cc/lg/94/94x38z.jpg"]);
  assert.equal(downloadName(r), "wallhaven-94x38z.jpg");
  assert.throws(() => parseWallhaven({ error: "Too many requests" }, () => false), /Too many requests/);
});

test("Bing: image of the day archive", () => {
  const page = parseBing(
    {
      images: [
        { startdate: "20261103", urlbase: "/th?id=OHR.LagosLagoon_EN-US1234567890", url: "/th?id=OHR.LagosLagoon_EN-US1234567890_1920x1080.jpg", copyright: "Lagos Lagoon at dawn, Nigeria (© Someone/Getty Images)", copyrightlink: "https://www.bing.com/search?q=lagos", title: "Morning on the water" },
      ],
    },
    () => false,
  );
  const r = page.results[0]!;
  assert.equal(r.sourceId, "bing-20261103-LagosLagoon");
  assert.equal(r.full, "https://www.bing.com/th?id=OHR.LagosLagoon_EN-US1234567890_UHD.jpg");
  assert.equal(r.title, "Morning on the water · 2026-11-03");
  assert.equal(r.credit, "© Someone/Getty Images");
  assert.deepEqual(splitCopyright("No credit here"), { title: "No credit here", credit: null });
  assert.ok(allowedDownload(r.full));
  assert.ok(allowedDownload("https://w.wallhaven.cc/full/94/wallhaven-94x38z.jpg"));
  assert.ok(!allowedDownload("http://w.wallhaven.cc/full/x.jpg"));
  assert.ok(!allowedDownload("https://evil.example/x.jpg"));
  assert.ok(!allowedDownload("file:///etc/passwd"));
});

// ── Displays and the scripts that set wallpapers ───────────────────────────

const display = (id: string, x: number, w: number, scale = 1): DisplayInfo => ({ id, label: id, bounds: { x, y: 0, width: w, height: (w * 9) / 16 }, pixels: { width: w * scale, height: ((w * 9) / 16) * scale }, primary: x === 0 });

test("displays: map layout, monitor matching, sharpness", () => {
  const ds = [display("1", 0, 1920), display("2", 1920, 2560)];
  const map = arrangement(ds, 300, 100);
  assert.ok(map[1]!.x > map[0]!.x && map[1]!.w > map[0]!.w);
  const monitors = [
    { id: "\\\\?\\DISPLAY#B", left: 1920, top: 0, right: 4480, bottom: 1440 },
    { id: "\\\\?\\DISPLAY#A", left: 0, top: 0, right: 1920, bottom: 1080 },
  ];
  const m = matchMonitors(ds, monitors, (d) => d.bounds);
  assert.equal(m.get("1"), "\\\\?\\DISPLAY#A");
  assert.equal(m.get("2"), "\\\\?\\DISPLAY#B");
  assert.equal(sharpness({ width: 3840, height: 2160 }, { width: 2560, height: 1440 }, "fill"), "sharp");
  assert.equal(sharpness({ width: 1280, height: 720 }, { width: 3840, height: 2160 }, "fill"), "blurry");
  assert.equal(resolutionLabel(3840, 2160), "4K");
  assert.equal(resolutionLabel(800, 600), "800×600");
});

test("wallpaper scripts quote paths safely", () => {
  assert.equal(psQuote("C:\\Users\\Ada O'Neil\\x.jpg"), "'C:\\Users\\Ada O''Neil\\x.jpg'");
  const ps = windowsSetScript([{ monitor: null, path: "C:\\a'b.jpg" }, { monitor: "\\\\?\\DISPLAY#1", path: "D:\\x.jpg" }], "fill");
  assert.match(ps, /\$w\.SetPosition\(4\)/);
  assert.match(ps, /\$w\.SetWallpaper\(\$null, 'C:\\a''b\.jpg'\)/);
  assert.match(ps, /IDesktopWallpaper/);
  // -EncodedCommand is base64 of UTF-16LE.
  assert.equal(Buffer.from(encodePowerShell("é'"), "base64").toString("utf16le"), "é'");
  assert.match(macScript([{ index: 2, path: '/Users/a/"q".jpg' }]), /desktop 2 to POSIX file "\/Users\/a\/\\"q\\".jpg"/);
  assert.deepEqual(gnomeCommands("file:///home/a/x.jpg", "fit")[2], ["set", "org.gnome.desktop.background", "picture-options", "scaled"]);
  assert.match(kdeScript({ "0": "file:///a.jpg" }, "fill"), /writeConfig\("FillMode", 2\)/);
  assert.equal(detectLinuxDesktop({ XDG_CURRENT_DESKTOP: "ubuntu:GNOME" }), "gnome");
  assert.equal(detectLinuxDesktop({ XDG_CURRENT_DESKTOP: "KDE" }), "kde");
});
