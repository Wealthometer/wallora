import { defineConfig } from "@playwright/test";

/**
 * Journeys through the real Electron app (built into dist/ with `npm run build`). Each test gets
 * its own data folder, a folder of sample pictures, a fake desktop that records what would be set,
 * and canned Wallhaven/Bing answers, so nothing touches your real wallpaper or the internet.
 * On Linux without a display, run under xvfb: `xvfb-run -a npm run test:e2e`.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure" },
});
