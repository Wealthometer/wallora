import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyTheme,
  autoInk,
  clampPosition,
  cleanOptions,
  cleanStyle,
  clockParts,
  countdownText,
  cpuPercent,
  daysUntil,
  formatBytes,
  formatUptime,
  greeting,
  monthGrid,
  newWidget,
  parseWeather,
  temperature,
  timeInWords,
  weatherLabel,
  weatherUrl,
  type AnyWidget,
} from "../src/shared/widgets.ts";

const at = (h: number, m: number, s = 0) => new Date(2026, 10, 3, h, m, s);

test("clock: 24 and 12 hour parts, words, greetings", () => {
  assert.deepEqual(clockParts(at(9, 5, 7), { hour12: false, seconds: true }), { hours: "09", minutes: "05", seconds: "07", period: "" });
  assert.deepEqual(clockParts(at(0, 30), { hour12: true, seconds: false }), { hours: "12", minutes: "30", seconds: "00", period: "AM" });
  assert.equal(clockParts(at(21, 16), { hour12: true, seconds: false }).hours, "9");
  assert.equal(clockParts(at(21, 16), { hour12: true, seconds: false }).period, "PM");
  assert.equal(timeInWords(at(9, 15)), "quarter past nine");
  assert.equal(timeInWords(at(9, 31)), "half past nine");
  assert.equal(timeInWords(at(17, 41)), "twenty to six");
  assert.equal(timeInWords(at(11, 58)), "noon");
  assert.equal(timeInWords(at(23, 59)), "midnight");
  assert.equal(timeInWords(at(14, 1)), "two o'clock");
  assert.equal(timeInWords(at(10, 23)), "twenty-five past ten");
  assert.equal(greeting(at(7, 0)), "Good morning");
  assert.equal(greeting(at(21, 0)), "Good evening");
  assert.equal(greeting(at(2, 0)), "Up late");
});

test("calendar grid and countdowns", () => {
  // November 2026 starts on a Sunday.
  const mon = monthGrid(2026, 10, 1);
  assert.deepEqual(mon[0], [null, null, null, null, null, null, 1]);
  assert.equal(mon.flat().filter((d) => d !== null).length, 30);
  assert.ok(mon.every((w) => w.length === 7));
  assert.deepEqual(monthGrid(2026, 10, 0)[0], [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(monthGrid(2024, 1, 1).flat().filter(Boolean).length, 29); // leap year
  assert.equal(daysUntil(at(23, 59), "2026-11-04"), 1);
  assert.equal(daysUntil(at(0, 1), "2026-12-25"), 52);
  assert.equal(daysUntil(at(12, 0), "2026-11-01"), -2);
  assert.equal(daysUntil(at(12, 0), "soon"), null);
  assert.deepEqual(countdownText(52, "Christmas"), { big: "52", small: "days until Christmas" });
  assert.deepEqual(countdownText(0, ""), { big: "Today", small: "the day" });
  assert.deepEqual(countdownText(-1, "Launch"), { big: "1", small: "day since Launch" });
  assert.equal(countdownText(null, "x").small, "Pick a date");
});

test("system stats helpers", () => {
  assert.equal(cpuPercent(null, { idle: 10, total: 20 }), null);
  assert.equal(cpuPercent({ idle: 100, total: 200 }, { idle: 130, total: 300 }), 70);
  assert.equal(cpuPercent({ idle: 100, total: 200 }, { idle: 100, total: 200 }), null);
  assert.equal(formatBytes(512 * 1024 ** 2), "512 MB");
  assert.equal(formatBytes(7.8 * 1024 ** 3), "7.8 GB");
  assert.equal(formatBytes(476 * 1024 ** 3), "476 GB");
  assert.equal(formatBytes(2 * 1024 ** 4), "2.0 TB");
  assert.equal(formatUptime(3 * 86_400 + 5 * 3600), "3d 5h");
  assert.equal(formatUptime(2 * 3600 + 7 * 60), "2h 7m");
  assert.equal(formatUptime(300), "5m");
});

test("weather: Open-Meteo request and answer", () => {
  const u = new URL(weatherUrl(6.5244, 3.3792));
  assert.equal(u.host, "api.open-meteo.com");
  assert.equal(u.searchParams.get("latitude"), "6.524");
  assert.match(u.searchParams.get("current")!, /weather_code/);
  const w = parseWeather({ current: { temperature_2m: 27.4, apparent_temperature: 31, weather_code: 61, is_day: 1, wind_speed_10m: 9 }, daily: { temperature_2m_max: [31.8], temperature_2m_min: [24.1] } }, "Lagos", 5);
  assert.deepEqual([w.temp, w.code, w.isDay, w.max, w.min, w.place], [27.4, 61, true, 31.8, 24.1, "Lagos"]);
  assert.throws(() => parseWeather({ error: true }, "x", 0), /unexpected/);
  assert.deepEqual(weatherLabel(0, false), { text: "Clear", icon: "moon" });
  assert.equal(weatherLabel(95, true).icon, "storm");
  assert.equal(weatherLabel(81, true).text, "Showers");
  assert.equal(temperature(27.4, "c"), "27°");
  assert.equal(temperature(27.4, "f"), "81°");
});

test("widgets: placement, cleaning what comes in, themes, auto colour", () => {
  const list: AnyWidget[] = [];
  const a = newWidget("clock", "a", "d1", list) as AnyWidget;
  list.push(a);
  const b = newWidget("note", "b", "d1", list) as AnyWidget;
  assert.notDeepEqual([a.x, a.y], [b.x, b.y], "new widgets don't land on top of each other");
  assert.equal(newWidget("clock", "c", "d2", list).x, a.x, "other displays have their own slots");
  assert.equal(a.style.font, "serif");
  assert.equal(newWidget("stats", "s", "d1", list).style.panel, "glass");

  assert.deepEqual(clampPosition(-1, 5), { x: 0, y: 0.98 });
  assert.deepEqual(clampPosition(Number.NaN, 0.5), { x: 0.05, y: 0.5 });
  const st = cleanStyle({ font: "comic", color: "red", scale: 9, opacity: 0, panel: "glass", shadow: "yes", align: "center" });
  assert.deepEqual([st.font, st.color, st.scale, st.opacity, st.panel, st.shadow, st.align], ["sans", "auto", 3, 0.2, "glass", true, "center"]);
  assert.equal(cleanStyle({ color: "#ff00AA" }).color, "#ff00AA");

  const clock = cleanOptions("clock", { face: "sundial", hour12: true, seconds: "on", extra: 1 });
  assert.deepEqual(clock, { face: "classic", hour12: true, seconds: false, showDate: true, greeting: false });
  assert.equal(cleanOptions("note", { text: "x".repeat(900) }).text.length, 400);
  assert.equal(cleanOptions("countdown", { date: "next week" }).date, "");
  assert.equal(cleanOptions("countdown", { date: "2026-12-25" }).date, "2026-12-25");
  assert.equal(cleanOptions("calendar", { weekStart: 0 }).weekStart, 0);
  assert.equal(cleanOptions("weather", { units: "kelvin" }).units, "c");

  const themed = applyTheme([a, b], "terminal");
  assert.ok(themed.every((w) => w.style.font === "mono" && w.style.panel === "solid"));
  assert.equal((themed[0] as AnyWidget & { kind: "clock" }).options.face, "minimal");
  assert.deepEqual(applyTheme([a], "nope"), [a]);
  assert.equal(autoInk(0.9), "#15131C");
  assert.equal(autoInk(0.2), "#FFFFFF");
  assert.equal(autoInk(null), "#FFFFFF");
});
