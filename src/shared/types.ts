/** Everything the main process and the window agree on. Plain data only: it crosses IPC. */

export type Fit = "fill" | "fit" | "stretch" | "center" | "tile" | "span";

export type Source = "folder" | "import" | "wallhaven" | "bing";

export type Wallpaper = {
  id: string;
  path: string;
  title: string;
  source: Source;
  /** Id at the online source ("94x38z", a Bing date), so the same picture isn't downloaded twice. */
  sourceId: string | null;
  /** Where to credit it: the photo's page online. */
  sourceUrl: string | null;
  credit: string | null;
  folderId: string | null;
  width: number;
  height: number;
  bytes: number;
  /** SHA-1 of the file, for finding duplicates. */
  hash: string;
  /** Dominant colours, most common first, as "#RRGGBB". */
  colors: string[];
  /** The colour the interface takes on while this wallpaper is showing. */
  accent: string;
  /** Average brightness, 0 (black) to 1 (white). */
  luminance: number;
  favourite: boolean;
  addedAt: number;
  lastShownAt: number | null;
  showCount: number;
  /** The file is gone from disk (moved or deleted outside Wallora). */
  missing: boolean;
};

export type Collection = { id: string; name: string; createdAt: number; count: number; cover: string[] };

export type Tone = "any" | "light" | "dark";
export type Hue = "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink" | "neutral";

/** A smart playlist fills itself from these rules; a normal one plays its own list. */
export type SmartRules = {
  collections: string[];
  favouritesOnly: boolean;
  hues: Hue[];
  tone: Tone;
  /** Minimum width in pixels, 0 for any. */
  minWidth: number;
  sources: Source[];
};

export type Playlist = {
  id: string;
  name: string;
  createdAt: number;
  /** Minutes between changes. */
  interval: number;
  shuffle: boolean;
  /** Prefer bright wallpapers in daylight and dark ones at night. */
  matchDaylight: boolean;
  smart: SmartRules | null;
  /** For normal playlists: wallpaper ids in play order. */
  items: string[];
  cover: string[];
};

export type RuleTime = { kind: "time"; minutes: number } | { kind: "sun"; event: SunEvent; offset: number };
export type SunEvent = "dawn" | "sunrise" | "sunset" | "dusk";

/** "From 07:00 on weekdays, play Mornings." The latest rule to have started is in charge. */
export type ScheduleRule = { id: string; days: number[]; at: RuleTime; playlistId: string; enabled: boolean };

export type Location = { name: string; lat: number; lng: number };

export type DisplayMode = "same" | "different" | "perDisplay";

export type DisplayInfo = {
  id: string;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  /** Size in real pixels. */
  pixels: { width: number; height: number };
  primary: boolean;
};

export type Settings = {
  fit: Fit;
  displayMode: DisplayMode;
  /** For "perDisplay": which playlist each display plays. */
  displayPlaylists: Record<string, string>;
  launchAtLogin: boolean;
  startHidden: boolean;
  closeToTray: boolean;
  pauseOnBattery: boolean;
  shortcuts: boolean;
  location: Location | null;
  scheduleEnabled: boolean;
  downloadFolder: string;
  wallhavenKey: string;
  /** The interface takes its accent colour from the current wallpaper. */
  liveAccent: boolean;
  /** Show desktop widgets. */
  widgetsEnabled: boolean;
  /** "desktop": under every window, like part of the wallpaper. "top": always in front. */
  widgetLayer: "desktop" | "top";
};

export type HistoryEntry = { id: number; wallpaperId: string; displayId: string; at: number; playlistId: string | null };

export type Folder = { id: string; path: string; recursive: boolean; addedAt: number; count: number; lastScan: number | null; error: string | null };

/** What's playing, for the player bar and the tray. */
export type NowPlaying = {
  playing: boolean;
  pausedReason: "user" | "battery" | null;
  playlistId: string | null;
  playlistName: string | null;
  /** Why this playlist: chosen by hand, by a schedule rule, or the library as a fallback. */
  reason: "manual" | "schedule" | "library";
  current: Record<string, string>;
  nextAt: number | null;
  lastChangeAt: number | null;
  upNext: string[];
  scheduleNext: { at: number; playlistName: string } | null;
};

export type OnlineResult = {
  source: "wallhaven" | "bing";
  sourceId: string;
  title: string;
  thumb: string;
  full: string;
  pageUrl: string;
  credit: string | null;
  width: number;
  height: number;
  colors: string[];
  fileType: string;
  /** Already in the library. */
  have: boolean;
};

export type OnlinePage = { results: OnlineResult[]; page: number; lastPage: number; total: number; seed: string | null };
