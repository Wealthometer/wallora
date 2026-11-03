import type { WallhavenQuery } from "./sources.ts";
import type { Collection, DisplayInfo, Folder, HistoryEntry, NowPlaying, OnlinePage, OnlineResult, Playlist, ScheduleRule, Settings, SmartRules, Wallpaper } from "./types.ts";

/** The window's view of the app, sent whole on start and in parts as things change. */
export type Snapshot = {
  wallpapers: Wallpaper[];
  collections: Collection[];
  membership: Record<string, string[]>;
  playlists: Playlist[];
  rules: ScheduleRule[];
  folders: Folder[];
  history: HistoryEntry[];
  settings: Settings;
  displays: DisplayInfo[];
  now: NowPlaying;
  desktop: { name: string; perDisplay: boolean; platform: string };
  version: string;
};

export type Progress = { kind: "scan" | "import" | "download"; id: string; label: string; done: number; total: number; finished?: boolean; error?: string };

export type Notice = { tone: "ok" | "error" | "info"; message: string };

/** Every call the window can make. Arguments are checked again in the main process. */
export type Api = {
  snapshot(): Snapshot;

  next(): boolean;
  previous(): boolean;
  setPlaying(playing: boolean): void;
  play(playlistId: string | null): boolean;
  followSchedule(): void;
  show(wallpaperId: string, displayId: string | null): boolean;

  favourite(ids: string[], on: boolean): void;
  rename(id: string, title: string): void;
  removeWallpapers(ids: string[], deleteFiles: boolean): { removed: number; trashed: number };
  reveal(id: string): void;
  openSource(id: string): void;
  importFiles(): { added: number; skipped: number; failed: number } | null;

  createCollection(name: string, ids: string[]): string;
  renameCollection(id: string, name: string): void;
  deleteCollection(id: string): void;
  addToCollection(id: string, ids: string[]): void;
  removeFromCollection(id: string, ids: string[]): void;

  createPlaylist(p: { name: string; smart: SmartRules | null; items: string[] }): string;
  updatePlaylist(id: string, patch: Partial<Pick<Playlist, "name" | "interval" | "shuffle" | "matchDaylight" | "smart">>): void;
  deletePlaylist(id: string): void;
  addToPlaylist(id: string, ids: string[]): void;
  removeFromPlaylist(id: string, ids: string[]): void;
  setPlaylistItems(id: string, ids: string[]): void;

  saveRule(rule: Omit<ScheduleRule, "id"> & { id?: string }): string;
  deleteRule(id: string): void;

  addFolder(): string | null;
  removeFolder(id: string): void;
  rescan(id: string | null): void;

  wallhaven(q: WallhavenQuery): OnlinePage;
  bing(): OnlinePage;
  download(r: OnlineResult): string;

  updateSettings(patch: Partial<Settings>): Settings;
  chooseDownloadFolder(): string | null;
  clearHistory(): void;
};

export type ApiMethod = keyof Api;

/** What the preload script puts on `window.wallora`. */
export type Bridge = {
  [K in ApiMethod]: (...args: Parameters<Api[K]>) => Promise<Awaited<ReturnType<Api[K]>>>;
} & {
  on(event: "snapshot", cb: (s: Partial<Snapshot>) => void): () => void;
  on(event: "progress", cb: (p: Progress) => void): () => void;
  on(event: "notice", cb: (n: Notice) => void): () => void;
};

export const API_METHODS: ApiMethod[] = [
  "snapshot",
  "next",
  "previous",
  "setPlaying",
  "play",
  "followSchedule",
  "show",
  "favourite",
  "rename",
  "removeWallpapers",
  "reveal",
  "openSource",
  "importFiles",
  "createCollection",
  "renameCollection",
  "deleteCollection",
  "addToCollection",
  "removeFromCollection",
  "createPlaylist",
  "updatePlaylist",
  "deletePlaylist",
  "addToPlaylist",
  "removeFromPlaylist",
  "setPlaylistItems",
  "saveRule",
  "deleteRule",
  "addFolder",
  "removeFolder",
  "rescan",
  "wallhaven",
  "bing",
  "download",
  "updateSettings",
  "chooseDownloadFolder",
  "clearHistory",
];
