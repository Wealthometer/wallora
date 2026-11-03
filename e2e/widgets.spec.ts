import { expect, test, type Page } from "@playwright/test";
import { launch, watchPictures, type Run } from "./app.ts";

let run: Run | undefined;
test.afterEach(async () => {
  await run?.close();
  run = undefined;
});

/** The transparent window that draws widgets on the desktop. */
async function desktopWindow(r: Run): Promise<Page> {
  await expect.poll(() => r.app.windows().length, { timeout: 15_000 }).toBeGreaterThan(1);
  const w = r.app.windows().find((p) => p !== r.page)!;
  await w.waitForSelector("[data-testid=overlay-layer]");
  return w;
}

test("widgets: add, style and move them; they appear on the desktop", async () => {
  run = await launch();
  const { page } = run;
  await watchPictures(run);
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("city-search").fill("lago");
  await page.getByTestId("city-Lagos").click();

  await page.getByTestId("nav-widgets").click();
  await expect(page.getByText("Nothing on this screen yet")).toBeVisible();
  await page.getByTestId("add-widget-clock").click();
  const stage = page.getByTestId("widget-stage-layer");
  await expect(stage.getByTestId("widget-clock")).toBeVisible();
  await expect(page.getByTestId("inspector-title")).toHaveText("Clock");

  // It's on the real desktop too, in its own click-through window.
  const desk = await desktopWindow(run);
  await expect(desk.getByTestId("widget-clock")).toContainText(/\d{2}:\d{2}/);
  const info = await run.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === "Wallora widgets")!;
    return { focusable: w.isFocusable(), taskbar: w.isVisible() };
  });
  expect(info.focusable).toBe(false);

  // Clock face, greeting and font follow the inspector.
  await page.getByTestId("face-words").click();
  await page.getByTestId("opt-greeting").click();
  await expect(desk.getByTestId("widget-clock")).toContainText(/It's .*(past|to|o'clock|noon|midnight)/);
  await expect(desk.getByTestId("widget-clock")).toContainText(/Good (morning|afternoon|evening|night)|Up late/);
  await page.getByTestId("font-mono").click();
  await expect.poll(() => desk.getByTestId("widget-clock").evaluate((e) => getComputedStyle(e).fontFamily)).toContain("JetBrains Mono");
  await page.getByTestId("widget-size").fill("2");
  await expect.poll(() => desk.getByTestId("widget-clock").evaluate((e) => getComputedStyle(e).fontSize)).toBe("32px");

  // Weather (canned Open-Meteo answer), system stats, a countdown.
  await page.getByTestId("add-widget-weather").click();
  await expect(desk.getByTestId("widget-weather")).toContainText("27°");
  await expect(desk.getByTestId("widget-weather")).toContainText("Partly cloudy");
  await expect(desk.getByTestId("widget-weather")).toContainText("Lagos · 32° / 24°");
  await page.getByTestId("add-widget-stats").click();
  await expect(desk.getByTestId("widget-stats")).toContainText(/CPU\s*\d+%/, { timeout: 15_000 });
  await expect(desk.getByTestId("widget-stats")).toContainText(/Memory/);
  await page.getByTestId("add-widget-countdown").click();
  const next = new Date(Date.now() + 10 * 86_400_000);
  const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  await page.getByTestId("countdown-label").fill("Launch");
  await page.getByTestId("countdown-date").fill(iso);
  await expect(desk.getByTestId("widget-countdown")).toContainText(/10\s*days until Launch/);

  // Drag the clock on the preview; it moves on the desktop.
  const clock = stage.getByTestId("widget-clock");
  const before = await desk.getByTestId("widget-clock").evaluate((e) => (e as HTMLElement).offsetLeft);
  await clock.scrollIntoViewIfNeeded();
  const box = (await clock.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 60, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => desk.getByTestId("widget-clock").evaluate((e) => (e as HTMLElement).offsetLeft)).toBeGreaterThan(before + 100);

  // One-click look.
  await page.getByTestId("theme-terminal").click();
  await expect.poll(() => desk.getByTestId("widget-weather").evaluate((e) => getComputedStyle(e).fontFamily)).toContain("JetBrains Mono");

  // Remove one, then hide them all: the desktop window goes away.
  await stage.getByTestId("widget-countdown").click();
  await page.getByTestId("remove-widget").click();
  await expect(desk.getByTestId("widget-countdown")).toHaveCount(0);
  await page.getByTestId("widgets-enabled").click();
  await expect.poll(() => run!.app.windows().length).toBe(1);
  await page.getByTestId("widgets-enabled").click();
  await desktopWindow(run);
});

test("widgets: arrange on the desktop itself, and they survive a restart", async () => {
  run = await launch();
  const { page } = run;
  await watchPictures(run);
  await page.getByTestId("nav-widgets").click();
  await page.getByTestId("add-widget-note").click();
  await page.getByTestId("note-text").fill("Ship it on Friday");
  let desk = await desktopWindow(run);
  await expect(desk.getByTestId("widget-note")).toHaveText("Ship it on Friday");

  // Edit mode: the desktop window comes forward and can be dragged on.
  await page.getByTestId("arrange-desktop").click();
  await expect.poll(async () => {
    const w = run!.app.windows().find((p) => p !== page);
    return w ? await w.getByTestId("overlay-done").count() : 0;
  }).toBe(1);
  desk = run.app.windows().find((p) => p !== page)!;
  const note = desk.getByTestId("widget-note");
  const b = (await note.boundingBox())!;
  await desk.mouse.move(b.x + 5, b.y + 5);
  await desk.mouse.down();
  await desk.mouse.move(b.x + 205, b.y + 105, { steps: 10 });
  await desk.mouse.up();
  await expect.poll(() => note.evaluate((e) => (e as HTMLElement).offsetLeft)).toBeGreaterThan(b.x + 150);
  await desk.getByTestId("overlay-done").click();
  await expect.poll(async () => {
    const w = run!.app.windows().find((p) => p !== page);
    return w ? await w.getByTestId("overlay-done").count() : -1;
  }).toBe(0);
  const placed = await run.app.windows().find((p) => p !== page)!.getByTestId("widget-note").evaluate((e) => (e as HTMLElement).offsetLeft);

  // Restart: same widget, same place.
  const data = run.data;
  await run.close();
  run = await launch(data);
  const again = await desktopWindow(run);
  await expect(again.getByTestId("widget-note")).toHaveText("Ship it on Friday");
  expect(Math.abs((await again.getByTestId("widget-note").evaluate((e) => (e as HTMLElement).offsetLeft)) - placed)).toBeLessThan(3);
});
