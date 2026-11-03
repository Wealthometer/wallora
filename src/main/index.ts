import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, net, powerMonitor, protocol, screen, shell, Tray } from "electron";
import { watch, type FSWatcher } from "node:fs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { API_METHODS, OVERLAY_METHODS, type Api, type Notice, type Progress, type Snapshot, type WidgetPatch } from "../shared/api.ts";
import type { WidgetKind } from "../shared/widgets.ts";
import type { DisplayInfo } from "../shared/types.ts";
import * as check from "./check.ts";
import { openDb } from "./db.ts";
import { Engine } from "./engine.ts";
import { decode } from "./images.ts";
import { Importer } from "./importer.ts";
import { Library } from "./library.ts";
import { bingDaily, defaultDownloadDir, download, fixturesDir, searchWallhaven } from "./online.ts";
import { pickSetter, WindowsSetter } from "./setters/index.ts";
import { Widgets } from "./widgets.ts";

// ── Paths and single instance ──────────────────────────────────────────────

if (process.env.WALLORA_USER_DATA) app.setPath("userData", process.env.WALLORA_USER_DATA);
const startHiddenArg = process.argv.includes("--hidden");

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

protocol.registerSchemesAsPrivileged([{ scheme: "wallora-img", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

const RESOURCES = app.isPackaged ? process.resourcesPath : join(__dirname, "..", "..", "resources");

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let lib: Library;
let importer: Importer;
let engine: Engine;
let widgets: Widgets;
const setter = pickSetter();

function dataDir(...p: string[]): string {
  return join(app.getPath("userData"), ...p);
}

function downloadDir(): string {
  return lib.settings().downloadFolder || process.env.WALLORA_DOWNLOADS || defaultDownloadDir(app.getPath("pictures"));
}

// ── Displays ───────────────────────────────────────────────────────────────

function displays(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay().id;
  return screen
    .getAllDisplays()
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    .map((d, i) => ({
      id: String(d.id),
      label: d.label || `Display ${i + 1}`,
      bounds: d.bounds,
      pixels: { width: Math.round(d.bounds.width * d.scaleFactor), height: Math.round(d.bounds.height * d.scaleFactor) },
      primary: d.id === primary,
    }));
}

// ── Talking to the window ──────────────────────────────────────────────────

function send(channel: "snapshot" | "progress" | "notice", payload: unknown) {
  if (win && !win.isDestroyed()) win.webContents.send(`wallora:${channel}`, payload);
}

function membership(): Record<string, string[]> {
  return Object.fromEntries([...lib.membership()].map(([k, v]) => [k, [...v]]));
}

function snapshot(): Snapshot {
  return {
    wallpapers: lib.wallpapers(),
    collections: lib.collections(),
    membership: membership(),
    playlists: lib.playlists(),
    rules: lib.rules(),
    folders: lib.folders(),
    history: lib.history(200),
    settings: lib.settings(),
    displays: displays(),
    now: engine.nowPlaying(),
    desktop: { name: setter.name, perDisplay: setter.perDisplay, platform: process.platform },
    version: app.getVersion(),
    widgets: widgets.list(),
    editingWidgets: widgets.isEditing(),
  };
}

/** After a change to the library: send what the window needs and let the player react. */
function libraryChanged() {
  send("snapshot", { wallpapers: lib.wallpapers(), collections: lib.collections(), membership: membership(), playlists: lib.playlists(), rules: lib.rules(), folders: lib.folders(), history: lib.history(200) });
  void engine.tick();
}

function notice(n: Notice) {
  send("notice", n);
}

function progress(p: Progress) {
  send("progress", p);
}

// ── Folder watching ────────────────────────────────────────────────────────

const watchers = new Map<string, FSWatcher>();
const rescanTimers = new Map<string, ReturnType<typeof setTimeout>>();
const scanning = new Set<string>();

async function scan(folderId: string) {
  if (scanning.has(folderId)) return;
  scanning.add(folderId);
  const folder = lib.folders().find((f) => f.id === folderId);
  try {
    const r = await importer.scanFolder(folderId, (done, total) => progress({ kind: "scan", id: folderId, label: folder?.path ?? "", done, total }));
    progress({ kind: "scan", id: folderId, label: folder?.path ?? "", done: 1, total: 1, finished: true });
    if (r.added.length) notice({ tone: "ok", message: `Added ${r.added.length} wallpaper${r.added.length === 1 ? "" : "s"} from ${folder?.path.split(/[\\/]/).pop() ?? "a folder"}` });
    if (r.failed.length) notice({ tone: "error", message: `${r.failed.length} file${r.failed.length === 1 ? "" : "s"} couldn't be read` });
  } catch (e) {
    notice({ tone: "error", message: e instanceof Error ? e.message : String(e) });
  } finally {
    scanning.delete(folderId);
    libraryChanged();
  }
}

function watchFolders() {
  const folders = lib.folders();
  for (const [id, w] of watchers) {
    if (folders.some((f) => f.id === id)) continue;
    w.close();
    watchers.delete(id);
  }
  for (const f of folders) {
    if (watchers.has(f.id)) continue;
    try {
      const w = watch(f.path, { recursive: f.recursive }, () => {
        clearTimeout(rescanTimers.get(f.id));
        rescanTimers.set(f.id, setTimeout(() => void scan(f.id), 2500));
      });
      w.on("error", () => {
        w.close();
        watchers.delete(f.id);
      });
      watchers.set(f.id, w);
    } catch {
      // The folder may be gone; the next scan reports it.
    }
  }
}

// ── The API ────────────────────────────────────────────────────────────────

type Handlers = { [K in keyof Api]: (...args: unknown[]) => ReturnType<Api[K]> | Promise<ReturnType<Api[K]>> };

const handlers: Handlers = {
  snapshot: () => snapshot(),

  next: () => engine.next(),
  previous: () => engine.previous(),
  setPlaying: (p) => engine.setPlaying(check.bool(p)),
  play: (id) => engine.play(check.optId(id)),
  followSchedule: () => engine.followSchedule(),
  show: (id, display) => engine.show(check.str(id, 64), check.optId(display)),

  favourite: (list, on) => {
    lib.setFavourite(check.ids(list), check.bool(on));
    libraryChanged();
  },
  rename: (id, title) => {
    lib.rename(check.str(id, 64), check.str(title, 200));
    libraryChanged();
  },
  removeWallpapers: async (list, deleteFiles) => {
    const chosen = check.ids(list)
      .map((id) => lib.wallpaper(id))
      .filter((w) => !!w);
    let trashed = 0;
    if (check.bool(deleteFiles)) {
      for (const w of chosen) {
        try {
          await shell.trashItem(w.path);
          trashed++;
        } catch {
          // Already gone, or the bin isn't available: it still leaves the library.
        }
      }
    }
    lib.remove(chosen.map((w) => w.id));
    engine.forget(chosen.map((w) => w.id));
    libraryChanged();
    return { removed: chosen.length, trashed };
  },
  reveal: (id) => {
    const w = lib.wallpaper(check.str(id, 64));
    if (w) shell.showItemInFolder(w.path);
  },
  openSource: (id) => {
    const w = lib.wallpaper(check.str(id, 64));
    if (w?.sourceUrl && /^https:\/\//.test(w.sourceUrl)) void shell.openExternal(w.sourceUrl);
  },
  importFiles: async () => {
    const r = await dialog.showOpenDialog(win!, { title: "Add pictures", properties: ["openFile", "multiSelections"], filters: [{ name: "Pictures", extensions: ["jpg", "jpeg", "png", "bmp"] }] });
    if (r.canceled || !r.filePaths.length) return null;
    progress({ kind: "import", id: "import", label: "Adding pictures", done: 0, total: r.filePaths.length });
    const out = await importer.importFiles(r.filePaths, join(downloadDir(), "Imported"));
    progress({ kind: "import", id: "import", label: "Adding pictures", done: 1, total: 1, finished: true });
    libraryChanged();
    return { added: out.added.length, skipped: out.skipped, failed: out.failed.length };
  },

  createCollection: (name, list) => {
    const id = lib.createCollection(check.str(name, 100));
    lib.addToCollection(id, check.ids(list));
    libraryChanged();
    return id;
  },
  renameCollection: (id, name) => {
    lib.renameCollection(check.str(id, 64), check.str(name, 100));
    libraryChanged();
  },
  deleteCollection: (id) => {
    lib.deleteCollection(check.str(id, 64));
    libraryChanged();
  },
  addToCollection: (id, list) => {
    lib.addToCollection(check.str(id, 64), check.ids(list));
    libraryChanged();
  },
  removeFromCollection: (id, list) => {
    lib.removeFromCollection(check.str(id, 64), check.ids(list));
    libraryChanged();
  },

  createPlaylist: (p) => {
    const v = p as { name: unknown; smart: unknown; items: unknown };
    const id = lib.createPlaylist({ name: check.str(v.name, 100), smart: check.smart(v.smart ?? null), items: check.ids(v.items ?? []) });
    libraryChanged();
    return id;
  },
  updatePlaylist: (id, patch) => {
    const p = patch as Record<string, unknown>;
    lib.updatePlaylist(check.str(id, 64), {
      name: p.name === undefined ? undefined : check.str(p.name, 100),
      interval: p.interval === undefined ? undefined : Number(p.interval),
      shuffle: p.shuffle === undefined ? undefined : check.bool(p.shuffle),
      matchDaylight: p.matchDaylight === undefined ? undefined : check.bool(p.matchDaylight),
      smart: p.smart === undefined ? undefined : check.smart(p.smart),
    });
    libraryChanged();
  },
  deletePlaylist: (id) => {
    lib.deletePlaylist(check.str(id, 64));
    libraryChanged();
  },
  addToPlaylist: (id, list) => {
    lib.addToPlaylist(check.str(id, 64), check.ids(list));
    libraryChanged();
  },
  removeFromPlaylist: (id, list) => {
    lib.removeFromPlaylist(check.str(id, 64), check.ids(list));
    libraryChanged();
  },
  setPlaylistItems: (id, list) => {
    lib.setPlaylistItems(check.str(id, 64), check.ids(list));
    libraryChanged();
  },

  saveRule: (r) => {
    const id = lib.saveRule(check.rule(r));
    libraryChanged();
    return id;
  },
  deleteRule: (id) => {
    lib.deleteRule(check.str(id, 64));
    libraryChanged();
  },

  addFolder: async () => {
    const r = await dialog.showOpenDialog(win!, { title: "Watch a folder of wallpapers", properties: ["openDirectory"] });
    if (r.canceled || !r.filePaths[0]) return null;
    const id = lib.addFolder(r.filePaths[0], true);
    watchFolders();
    libraryChanged();
    void scan(id);
    return id;
  },
  removeFolder: (id) => {
    const fid = check.str(id, 64);
    const gone = lib.folderWallpapers(fid).map((w) => w.id);
    lib.removeFolder(fid);
    engine.forget(gone);
    watchFolders();
    libraryChanged();
  },
  rescan: (id) => {
    const fid = check.optId(id);
    for (const f of lib.folders()) if (fid === null || f.id === fid) void scan(f.id);
  },

  wallhaven: (q) => searchWallhaven(lib, check.wallhavenQuery(q)),
  bing: () => bingDaily(lib),
  download: async (r) => {
    const res = check.onlineResult(r);
    const key = `${res.source}:${res.sourceId}`;
    try {
      const w = await download(lib, importer, res, downloadDir(), (done, total) => progress({ kind: "download", id: key, label: res.title, done, total }));
      progress({ kind: "download", id: key, label: res.title, done: 1, total: 1, finished: true });
      libraryChanged();
      return w.id;
    } catch (e) {
      progress({ kind: "download", id: key, label: res.title, done: 0, total: 1, finished: true, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },

  updateSettings: (patch) => {
    const clean = check.settingsPatch(patch);
    const before = lib.settings();
    const next = lib.updateSettings(clean);
    applySettings();
    if (clean.widgetLayer !== undefined && clean.widgetLayer !== before.widgetLayer) widgets.closeAll();
    widgets.sync();
    send("snapshot", { settings: next });
    void engine.tick();
    return next;
  },
  chooseDownloadFolder: async () => {
    const r = await dialog.showOpenDialog(win!, { title: "Save downloads to", properties: ["openDirectory", "createDirectory"], defaultPath: downloadDir() });
    if (r.canceled || !r.filePaths[0]) return null;
    const next = lib.updateSettings({ downloadFolder: r.filePaths[0] });
    send("snapshot", { settings: next });
    return r.filePaths[0];
  },
  clearHistory: () => {
    lib.clearHistory();
    libraryChanged();
  },

  addWidget: (kind, display) => widgets.add(check.str(kind, 20) as WidgetKind, check.str(display, 64)),
  updateWidget: (id, patch) => widgets.update(check.str(id, 64), (patch && typeof patch === "object" ? patch : {}) as WidgetPatch),
  removeWidget: (id) => widgets.remove(check.str(id, 64)),
  duplicateWidget: (id) => widgets.duplicate(check.str(id, 64)),
  applyWidgetTheme: (theme) => widgets.theme(check.str(theme, 30)),
  setEditingWidgets: (on) => widgets.setEditing(check.bool(on)),
  weather: () => widgets.weather(),
  stats: () => widgets.stats(),
  // Answered per window in registerIpc (each widget window gets its own display).
  overlayState: () => widgets.overlayState(String(screen.getPrimaryDisplay().id)),
};

function registerIpc() {
  ipcMain.handle("wallora", async (event, method: unknown, args: unknown) => {
    if (typeof method !== "string" || !API_METHODS.includes(method as keyof Api)) throw new Error("Unknown call");
    // The app's own window may make any call; widget windows only a few.
    const overlayDisplay = widgets?.windowFor(event.sender) ?? null;
    const fromApp = !!win && !win.isDestroyed() && event.sender === win.webContents;
    if (!fromApp && !(overlayDisplay && OVERLAY_METHODS.includes(method as keyof Api))) throw new Error("Not allowed");
    if (method === "overlayState" && overlayDisplay) return widgets.overlayState(overlayDisplay);
    const fn = handlers[method as keyof Api] as (...a: unknown[]) => unknown;
    try {
      return await fn(...(Array.isArray(args) ? args : []));
    } catch (e) {
      // Send back a plain message the window can show.
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  });
}

// ── Images for the window ──────────────────────────────────────────────────

function registerProtocol() {
  protocol.handle("wallora-img", async (req) => {
    const u = new URL(req.url);
    const id = decodeURIComponent(u.pathname.slice(1));
    if (u.hostname === "fixture") {
      const dir = fixturesDir();
      return dir && /^[\w.%-]+$/.test(id) ? net.fetch(pathToFileURL(join(dir, id)).href) : new Response(null, { status: 404 });
    }
    if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
    if (u.hostname === "thumb") {
      const r = await net.fetch(pathToFileURL(dataDir("thumbs", `${id}.jpg`)).href).catch(() => null);
      if (r?.ok) return new Response(r.body, { headers: { "content-type": "image/jpeg", "cache-control": "max-age=31536000, immutable" } });
    }
    // Full size (or a thumbnail that's missing): the wallpaper file itself, only if it's in the library.
    const w = lib.wallpaper(id);
    if (!w) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(w.path).href).catch(() => new Response(null, { status: 404 }));
  });
}

// ── Window, tray, shortcuts ────────────────────────────────────────────────

function createWindow(show: boolean) {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    show: false,
    backgroundColor: "#0D0D12",
    title: "Wallora",
    icon: join(RESOURCES, "icon.png"),
    titleBarStyle: "hidden",
    ...(process.platform === "darwin" ? { trafficLightPosition: { x: 18, y: 18 } } : { titleBarOverlay: { color: "#00000000", symbolColor: "#F4F1FF", height: 44 } }),
    webPreferences: { preload: join(__dirname, "..", "preload", "index.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(process.env.VITE_DEV_URL ?? "file:")) e.preventDefault();
  });
  win.on("close", (e) => {
    if (!quitting && lib.settings().closeToTray && tray) {
      e.preventDefault();
      win?.hide();
    }
  });
  win.once("ready-to-show", () => {
    if (show) win?.show();
  });
  // Widget windows keep the app "open", so quitting on close has to be done here.
  win.on("closed", () => {
    if (!quitting && !lib.settings().closeToTray) {
      quitting = true;
      app.quit();
    }
  });
  if (process.env.VITE_DEV_URL) void win.loadURL(process.env.VITE_DEV_URL);
  else void win.loadFile(join(__dirname, "..", "renderer", "index.html"));
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow(true);
  else {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
}

function trayMenu() {
  if (!tray) return;
  const np = engine.nowPlaying();
  const primary = displays().find((d) => d.primary) ?? displays()[0];
  const currentId = primary ? np.current[primary.id] : undefined;
  const current = currentId ? lib.wallpaper(currentId) : null;
  const playlists = lib.playlists();
  tray.setToolTip(current ? `Wallora: ${current.title}` : "Wallora");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: current ? current.title : "Nothing showing yet", enabled: false },
      { label: np.playlistName ? `Playing ${np.playlistName}` : "", enabled: false, visible: !!np.playlistName },
      { type: "separator" },
      { label: "Next wallpaper", click: () => void engine.next() },
      { label: "Previous", click: () => void engine.previous() },
      { label: np.pausedReason === "user" ? "Resume" : "Pause", click: () => void engine.setPlaying(np.pausedReason === "user") },
      {
        label: current?.favourite ? "Remove from favourites" : "Add to favourites",
        enabled: !!current,
        click: () => {
          if (!current) return;
          lib.setFavourite([current.id], !current.favourite);
          libraryChanged();
        },
      },
      {
        label: "Play playlist",
        submenu: [
          { label: "Follow the schedule", type: "radio", checked: np.reason !== "manual", click: () => void engine.followSchedule() },
          { type: "separator" },
          ...playlists.map((p) => ({ label: p.name, type: "radio" as const, checked: np.reason === "manual" && np.playlistId === p.id, click: () => void engine.play(p.id) })),
        ],
      },
      { type: "separator" },
      { label: "Open Wallora", click: showWindow },
      {
        label: "Quit",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function createTray() {
  const icon = nativeImage.createFromPath(join(RESOURCES, process.platform === "darwin" ? "trayTemplate.png" : "tray.png"));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.on("click", showWindow);
  trayMenu();
}

function applySettings() {
  const s = lib.settings();
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: s.launchAtLogin, args: ["--hidden"] });
  globalShortcut.unregisterAll();
  if (s.shortcuts) {
    globalShortcut.register("CommandOrControl+Alt+Right", () => void engine.next());
    globalShortcut.register("CommandOrControl+Alt+Left", () => void engine.previous());
    globalShortcut.register("CommandOrControl+Alt+Space", () => void engine.setPlaying(engine.nowPlaying().pausedReason === "user"));
  }
}

// ── Start ──────────────────────────────────────────────────────────────────

app.on("second-instance", showWindow);

app.whenReady().then(async () => {
  mkdirSync(dataDir("thumbs"), { recursive: true });
  lib = new Library(openDb(dataDir("wallora.db")));
  importer = new Importer(lib, decode, dataDir("thumbs"));
  engine = new Engine({
    lib,
    setter,
    displays,
    onBattery: () => powerMonitor.isOnBatteryPower(),
    onChange: (np) => {
      send("snapshot", { now: np, history: lib.history(200) });
      trayMenu();
      widgets?.pushState();
    },
    onError: (message) => notice({ tone: "error", message }),
  });

  widgets = new Widgets({
    lib,
    now: () => engine.nowPlaying(),
    preload: join(__dirname, "..", "preload", "index.cjs"),
    load: (w, displayId) => {
      if (process.env.VITE_DEV_URL) void w.loadURL(`${process.env.VITE_DEV_URL}overlay.html?display=${encodeURIComponent(displayId)}`);
      else void w.loadFile(join(__dirname, "..", "renderer", "overlay.html"), { query: { display: displayId } });
    },
    sendToBottom: setter instanceof WindowsSetter ? (hwnd) => setter.sendToBottom(hwnd) : undefined,
    fixtures: fixturesDir() ?? null,
    onChange: () => send("snapshot", { widgets: widgets.list(), editingWidgets: widgets.isEditing() }),
  });

  registerProtocol();
  registerIpc();
  Menu.setApplicationMenu(process.platform === "darwin" ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]) : null);
  createTray();
  applySettings();
  createWindow(!(startHiddenArg || lib.settings().startHidden));

  const displaysChanged = () => {
    send("snapshot", { displays: displays() });
    void engine.tick();
    widgets.sync();
    widgets.restack();
  };
  screen.on("display-added", displaysChanged);
  screen.on("display-removed", displaysChanged);
  screen.on("display-metrics-changed", displaysChanged);
  powerMonitor.on("on-ac", () => void engine.tick());
  powerMonitor.on("on-battery", () => void engine.tick());
  powerMonitor.on("resume", () => void engine.tick());

  watchFolders();
  for (const f of lib.folders()) void scan(f.id);
  await engine.start();
  widgets.sync();
});

app.on("activate", showWindow);
app.on("before-quit", () => {
  quitting = true;
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  widgets?.closeAll();
  engine?.stop();
});
app.on("window-all-closed", () => {
  // With the tray, Wallora keeps running; without it (closeToTray off), closing quits.
  if (!lib?.settings().closeToTray) app.quit();
});
