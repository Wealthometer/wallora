import { _electron, type ElectronApplication, type Page } from "@playwright/test";
import { cpSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export type Run = { app: ElectronApplication; page: Page; data: string; pictures: string; desktop: () => { fit: string; assignments: { display: string | null; path: string }[] } | null; close: () => Promise<void> };

/** Starts Wallora with a fresh (or given) data folder. */
export async function launch(data = mkdtempSync(join(tmpdir(), "wallora-e2e-"))): Promise<Run> {
  const pictures = join(data, "Pictures");
  if (!existsSync(pictures)) cpSync(join(ROOT, "e2e", "fixtures", "pictures"), pictures, { recursive: true });
  const desktopFile = join(data, "desktop.json");
  const app = await _electron.launch({
    args: [ROOT],
    env: {
      ...process.env,
      WALLORA_USER_DATA: join(data, "user"),
      WALLORA_FAKE_DESKTOP: desktopFile,
      WALLORA_ONLINE_FIXTURES: join(ROOT, "e2e", "fixtures", "online"),
      WALLORA_DOWNLOADS: join(data, "Downloads"),
    },
  });
  // The app window (desktop widget windows may open first after a restart).
  await app.firstWindow();
  let page: Page | undefined;
  for (let i = 0; i < 100 && !page; i++) {
    page = app.windows().find((w) => !w.url().includes("overlay.html"));
    if (!page) await new Promise((r) => setTimeout(r, 100));
  }
  if (!page) throw new Error("The Wallora window didn't open");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() !== "Wallora widgets")?.setSize(1440, 900));
  await page.waitForSelector("[data-testid=player]");
  return {
    app,
    page,
    data,
    pictures,
    desktop: () => (existsSync(desktopFile) ? JSON.parse(readFileSync(desktopFile, "utf8")) : null),
    close: async () => {
      await app.evaluate(({ app: a }) => {
        // Quit for real (closing the window only hides it to the tray).
        a.emit("before-quit");
        a.exit(0);
      }).catch(() => undefined);
    },
  };
}

/** Makes the next "choose a folder/files" dialog answer with these paths. */
export async function answerDialog(run: Run, paths: string[]) {
  await run.app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: p })) as typeof dialog.showOpenDialog;
  }, paths);
}

export async function watchPictures(run: Run) {
  await answerDialog(run, [run.pictures]);
  await run.page.getByTestId("nav-folders").click();
  await run.page.getByTestId("watch-folder").click();
  await run.page.getByTestId("folder-count").filter({ hasText: "12 wallpapers" }).waitFor({ timeout: 20_000 });
}
