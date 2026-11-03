import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { answerDialog, launch, watchPictures, type Run } from "./app.ts";

let run: Run;
test.afterEach(async () => {
  await run?.close();
});

test("watching a folder fills the library and starts changing the wallpaper", async () => {
  run = await launch();
  const { page } = run;
  await expect(page.getByTestId("welcome-folder")).toBeVisible();
  await watchPictures(run);

  // Something is on the desktop straight away, and it's one of the pictures.
  await expect.poll(() => run.desktop()?.assignments[0]?.path ?? "").toContain(run.pictures);
  const first = run.desktop()!.assignments[0]!.path;
  await expect(page.getByTestId("now-title")).not.toHaveText(/Starting|Add some/);
  await expect(page.getByTestId("now-source")).toContainText("Your library");
  await expect(page.getByTestId("next-in")).toContainText("Next in");

  // Next and previous.
  await page.getByTestId("next").click();
  await expect.poll(() => run.desktop()!.assignments[0]!.path).not.toBe(first);
  await page.getByTestId("prev").click();
  await expect.poll(() => run.desktop()!.assignments[0]!.path).toBe(first);

  // Pause.
  await page.getByTestId("play-pause").click();
  await expect(page.getByTestId("next-in")).toHaveText("Paused");
  await page.getByTestId("play-pause").click();
  await expect(page.getByTestId("next-in")).toContainText("Next in");

  // History lists what was shown.
  await page.getByTestId("nav-history").click();
  await expect(page.getByTestId("history-list").locator(".track")).toHaveCount(3);
});

test("library: search, colours, details, favourites, collections and removing", async () => {
  run = await launch();
  const { page } = run;
  await watchPictures(run);
  await page.getByTestId("nav-library").click();
  await expect(page.getByTestId("library-count")).toContainText("12 wallpapers");

  await page.getByTestId("search").fill("dunes");
  await expect(page.getByTestId("grid").locator(".tile")).toHaveCount(1);
  await page.getByTestId("search").fill("");
  await page.getByTestId("tone-dark").click();
  const dark = await page.getByTestId("grid").locator(".tile").count();
  expect(dark).toBeGreaterThan(2);
  expect(dark).toBeLessThan(12);
  await page.getByTestId("tone-any").click();

  // Details: palette, sharpness, favourite, set now.
  await page.getByTestId("tile-Desert dunes").click();
  await expect(page.getByTestId("detail-title")).toHaveText("Desert dunes");
  await page.getByTestId("detail-favourite").click();
  await page.getByTestId("detail-set").click();
  await expect.poll(() => run.desktop()!.assignments[0]!.path).toBe(join(run.pictures, "desert-dunes.jpg"));
  await page.keyboard.press("Escape");
  await page.locator(".scrim").first().click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId("nav-favourites")).toContainText("1");
  // The interface takes its colour from the new wallpaper (warm orange, not the default violet).
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().toUpperCase())).not.toBe("#A89BFF");

  // Select three and make a collection.
  for (const t of ["Desert dunes", "Red rocks", "Golden hour fields"]) await page.getByTestId(`select-${t}`).click();
  await expect(page.getByTestId("selbar")).toContainText("3 selected");
  await page.getByTestId("sel-collection").click();
  await page.getByTestId("new-list-name").fill("Warm");
  await page.getByTestId("new-list-create").click();
  await page.getByTestId("nav-collection-Warm").click();
  await expect(page.getByTestId("library-count")).toContainText("3 wallpapers");

  // Right-click → remove from the library (the file stays on disk).
  await page.getByTestId("tile-Red rocks").click({ button: "right" });
  await page.getByTestId("menu-remove").click();
  await page.getByTestId("remove-library").click();
  await expect(page.getByTestId("library-count")).toContainText("2 wallpapers");
  await page.getByTestId("nav-library").click();
  await expect(page.getByTestId("library-count")).toContainText("11 wallpapers");
});

test("playlists: pick wallpapers, play, change settings; smart playlists fill themselves", async () => {
  run = await launch();
  const { page } = run;
  await watchPictures(run);

  await page.getByTestId("new-playlist").click();
  await page.getByTestId("playlist-name").fill("Evenings");
  await page.getByTestId("create-playlist").click();
  await expect(page.getByTestId("playlist-title")).toHaveText("Evenings");
  await page.getByTestId("add-wallpapers").click();
  await page.getByTestId("pick-Neon city").click();
  await page.getByTestId("pick-Midnight purple").click();
  await page.getByTestId("picker-add").click();
  await expect(page.getByTestId("tracks").locator(".track")).toHaveCount(2);

  await page.getByTestId("interval").selectOption("1");
  await page.getByTestId("shuffle").click(); // in order
  await page.getByTestId("play-playlist").click();
  await expect(page.getByTestId("now-source")).toContainText("Playing Evenings");
  await expect.poll(() => run.desktop()!.assignments[0]!.path).toMatch(/neon-city|midnight-purple/);
  await expect(page.getByTestId("next-in")).toContainText(/Next in (\d+s|1 min)/);

  // A smart playlist of dark pictures.
  await page.getByTestId("new-playlist").click();
  await page.getByTestId("playlist-name").fill("After dark");
  await page.getByTestId("playlist-kind-smart").click();
  await page.getByTestId("rule-tone-dark").click();
  await expect(page.getByTestId("rules-summary")).toContainText(/dark · \d+ right now/);
  await page.getByTestId("rules-save").click();
  await expect(page.getByTestId("playlist-title")).toHaveText("After dark");
  const n = await page.getByTestId("tracks").locator(".track").count();
  expect(n).toBeGreaterThan(2);

  await page.getByTestId("delete-playlist").click();
  await expect(page.getByTestId("nav-playlist-After dark")).toHaveCount(0);
});

test("schedule: rules start playlists and show on the week", async () => {
  run = await launch();
  const { page } = run;
  await watchPictures(run);
  for (const name of ["Day", "Night"]) {
    await page.getByTestId("new-playlist").click();
    await page.getByTestId("playlist-name").fill(name);
    await page.getByTestId("playlist-kind-smart").click();
    await page.getByTestId(name === "Day" ? "rule-tone-light" : "rule-tone-dark").click();
    await page.getByTestId("rules-save").click();
  }
  await page.getByTestId("nav-schedule").click();

  // Day from 00:00 every day: it's in charge right away.
  await page.getByTestId("add-rule").click();
  await page.getByTestId("rule-playlist").selectOption({ label: "Day" });
  await page.getByTestId("rule-time").fill("00:00");
  for (const d of [6, 0]) await page.getByTestId(`day-${d}`).click(); // weekdays + weekend = every day
  await page.getByTestId("rule-save").click();
  await expect(page.getByTestId("rule-Day")).toContainText("Every day");
  await expect(page.getByTestId("now-source")).toContainText("Scheduled: Day");
  await expect(page.getByTestId("week").locator(".block").first()).toBeVisible();

  // A sunset rule needs a location.
  await page.getByTestId("add-rule").click();
  await page.getByTestId("rule-playlist").selectOption({ label: "Night" });
  await page.getByTestId("rule-kind-sun").click();
  await page.getByTestId("rule-save").click();
  await expect(page.getByText("Sunrise and sunset rules need your location")).toBeVisible();

  await page.getByTestId("nav-settings").click();
  await page.getByTestId("city-search").fill("lago");
  await page.getByTestId("city-Lagos").click();
  await expect(page.getByTestId("location-name")).toHaveText("Lagos");
  await page.getByTestId("nav-schedule").click();
  await expect(page.getByText("Sunrise and sunset rules need your location")).toHaveCount(0);
  await expect(page.getByTestId("rule-Night")).toContainText("At sunset");

  await page.getByTestId("schedule-enabled").click();
  await expect(page.getByTestId("now-source")).toContainText("Your library");
});

test("discover: download from Wallhaven and Bing into the library", async () => {
  run = await launch();
  const { page } = run;
  await page.getByTestId("nav-discover").click();
  // The sketchy result is never shown.
  await expect(page.getByTestId("wh-results").locator(".tile")).toHaveCount(3);
  await page.getByTestId("download-n30n01").click();
  await page.getByTestId("set-n30n01").click();
  await expect.poll(() => run.desktop()?.assignments[0]?.path ?? "").toBe(join(run.data, "Downloads", "wallhaven-n30n01.jpg"));

  await page.getByTestId("discover-tab-bing").click();
  await expect(page.getByTestId("bing-results").locator(".tile")).toHaveCount(2);
  await page.getByTestId("download-bing-20261103-LagosLagoon").click();
  await expect(page.getByTestId("set-bing-20261103-LagosLagoon")).toBeVisible();

  await page.getByTestId("nav-library").click();
  await expect(page.getByTestId("library-count")).toContainText("2 wallpapers");
  await page.getByTestId("tile-Morning on the lagoon · 2026-11-03").click();
  await expect(page.getByTestId("detail")).toContainText("© Example Photographer");
});

test("everything is still there after a restart", async () => {
  run = await launch();
  await watchPictures(run);
  await run.page.getByTestId("nav-library").click();
  await run.page.getByTestId("select-Ocean blue").click();
  await run.page.getByTestId("sel-favourite").click();
  await run.page.getByTestId("nav-settings").click();
  await run.page.getByTestId("set-battery").click();
  const data = run.data;
  await run.close();

  run = await launch(data);
  await expect(run.page.getByTestId("nav-library")).toContainText("12");
  await expect(run.page.getByTestId("nav-favourites")).toContainText("1");
  await run.page.getByTestId("nav-settings").click();
  await expect(run.page.getByTestId("set-battery")).toHaveAttribute("aria-checked", "false");
});

test("adding pictures copies them and skips ones already there", async () => {
  run = await launch();
  const { page } = run;
  await answerDialog(run, [join(run.pictures, "ocean-blue.jpg"), join(run.pictures, "storm-grey.jpg")]);
  await page.getByTestId("welcome-import").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Added 2 wallpapers" })).toBeVisible();
  await page.getByTestId("nav-library").click();
  await expect(page.getByTestId("library-count")).toContainText("2 wallpapers");
  await answerDialog(run, [join(run.pictures, "ocean-blue.jpg")]);
  await page.getByTestId("add-pictures").click();
  await expect(page.getByTestId("toast").filter({ hasText: "1 already in your library" })).toBeVisible();
});
