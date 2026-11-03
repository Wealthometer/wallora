import { useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Compass,
  FolderOpen,
  Heart,
  History,
  Images,
  Info,
  ListMusic,
  Monitor,
  Pause,
  Play,
  Plus,
  Settings as Cog,
  SkipBack,
  SkipForward,
  Sparkles,
  TriangleAlert,
  Layers,
  CalendarDays,
} from "lucide-react";
import { inkOn } from "../shared/color.ts";
import { api, go, openDetail, run, thumb, useStore, type View } from "./store.ts";
import { Asks } from "./ui/actions.tsx";
import { Detail } from "./ui/Detail.tsx";
import { untilText, useClock } from "./ui/kit.tsx";
import { DisplaysView } from "./views/Displays.tsx";
import { DiscoverView } from "./views/Discover.tsx";
import { FoldersView } from "./views/Folders.tsx";
import { HistoryView } from "./views/History.tsx";
import { LibraryView } from "./views/Library.tsx";
import { NowView } from "./views/Now.tsx";
import { NewPlaylist, PlaylistView } from "./views/Playlist.tsx";
import { ScheduleView } from "./views/Schedule.tsx";
import { SettingsView } from "./views/Settings.tsx";

export function App() {
  const snap = useStore((s) => s.snap);
  const view = useStore((s) => s.view);
  const detail = useStore((s) => s.detail);
  const byId = useStore((s) => s.byId);

  // The accent colour follows the wallpaper on the main display.
  const primary = snap?.displays.find((d) => d.primary) ?? snap?.displays[0];
  const currentId = primary ? snap?.now.current[primary.id] : undefined;
  const current = currentId ? byId.get(currentId) : undefined;
  useEffect(() => {
    const accent = snap?.settings.liveAccent && current ? current.accent : "#A89BFF";
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-ink", inkOn(accent));
  }, [current, snap?.settings.liveAccent]);

  if (!snap) return null;
  return (
    <>
      <Backdrop id={current?.id ?? null} />
      <div className="grain" />
      <div className="titlebar-drag" />
      <div className={`app ${snap.desktop.platform === "darwin" ? "mac" : ""}`}>
        <Sidebar view={view} />
        <main className={`main${view.name === "now" || view.name === "playlist" ? " no-pad" : ""}`} data-testid={`view-${view.name}`}>
          <Router view={view} />
        </main>
      </div>
      <Player />
      {detail ? <Detail id={detail} onClose={() => openDetail(null)} /> : null}
      <Toasts />
      <Asks />
    </>
  );
}

function Router({ view }: { view: View }) {
  switch (view.name) {
    case "now":
      return <NowView />;
    case "library":
      return <LibraryView key={view.filter ?? "all"} filter={view.filter} />;
    case "collection":
      return <LibraryView key={view.id} collectionId={view.id} />;
    case "playlist":
      return <PlaylistView key={view.id} id={view.id} />;
    case "schedule":
      return <ScheduleView />;
    case "discover":
      return <DiscoverView />;
    case "folders":
      return <FoldersView />;
    case "history":
      return <HistoryView />;
    case "displays":
      return <DisplaysView />;
    case "settings":
      return <SettingsView />;
  }
}

/** The current wallpaper, blurred behind everything; cross-fades when it changes. */
function Backdrop({ id }: { id: string | null }) {
  const [layers, setLayers] = useState<{ id: string; key: number }[]>([]);
  const [shown, setShown] = useState<string | null>(null);
  if (id !== shown) {
    setShown(id);
    if (id) setLayers((l) => [...l.slice(-1), { id, key: Date.now() }]);
  }
  return (
    <div className="backdrop" aria-hidden>
      {layers.map((l, i) => (
        <img key={l.key} src={thumb(l.id)} alt="" className={i === layers.length - 1 ? "on" : ""} onLoad={(e) => e.currentTarget.classList.add("on")} />
      ))}
    </div>
  );
}

function NavItem({ icon: I, label, on, onClick, count, testId, children }: { icon?: typeof Images; label: string; on: boolean; onClick: () => void; count?: number; testId?: string; children?: React.ReactNode }) {
  return (
    <button className={`nav-item${on ? " on" : ""}`} onClick={onClick} data-testid={testId} aria-current={on ? "page" : undefined}>
      {I ? <I size={18} /> : null}
      {children}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {count !== undefined ? <span className="count">{count}</span> : null}
    </button>
  );
}

function Sidebar({ view }: { view: View }) {
  const snap = useStore((s) => s.snap)!;
  const [newPlaylist, setNewPlaylist] = useState(false);
  const favs = snap.wallpapers.filter((w) => w.favourite).length;
  const is = (name: View["name"], extra?: (v: View) => boolean) => view.name === name && (!extra || extra(view));
  return (
    <nav className="sidebar" aria-label="Wallora">
      <div className="brand">
        <div className="brand-mark" />
        <div className="brand-name">Wallora</div>
      </div>
      <NavItem icon={Sparkles} label="Now showing" on={is("now")} onClick={() => go({ name: "now" })} testId="nav-now" />
      <NavItem icon={Images} label="Library" count={snap.wallpapers.length} on={is("library", (v) => v.name === "library" && !v.filter)} onClick={() => go({ name: "library" })} testId="nav-library" />
      <NavItem icon={Heart} label="Favourites" count={favs} on={is("library", (v) => v.name === "library" && v.filter === "favourites")} onClick={() => go({ name: "library", filter: "favourites" })} testId="nav-favourites" />
      <NavItem icon={Compass} label="Discover" on={is("discover")} onClick={() => go({ name: "discover" })} testId="nav-discover" />
      <NavItem icon={History} label="History" on={is("history")} onClick={() => go({ name: "history" })} testId="nav-history" />

      <div className="nav-label">
        Playlists
        <button aria-label="New playlist" onClick={() => setNewPlaylist(true)} data-testid="new-playlist">
          <Plus size={15} />
        </button>
      </div>
      {snap.playlists.map((p) => (
        <NavItem key={p.id} label={p.name} on={is("playlist", (v) => v.name === "playlist" && v.id === p.id)} onClick={() => go({ name: "playlist", id: p.id })} testId={`nav-playlist-${p.name}`}>
          {p.cover[0] ? <img className="mini" src={thumb(p.cover[0])} alt="" /> : <span className="mini" style={{ display: "grid", placeItems: "center" }}><ListMusic size={14} /></span>}
        </NavItem>
      ))}
      {!snap.playlists.length ? <div className="small" style={{ padding: "2px 12px" }}>Make one to play wallpapers like music.</div> : null}

      <div className="nav-label">Collections</div>
      {snap.collections.map((c) => (
        <NavItem key={c.id} icon={Layers} label={c.name} count={c.count} on={is("collection", (v) => v.name === "collection" && v.id === c.id)} onClick={() => go({ name: "collection", id: c.id })} testId={`nav-collection-${c.name}`} />
      ))}
      {!snap.collections.length ? <div className="small" style={{ padding: "2px 12px" }}>Right-click wallpapers to group them.</div> : null}

      <div className="nav-label">Set up</div>
      <NavItem icon={CalendarClock} label="Schedule" on={is("schedule")} onClick={() => go({ name: "schedule" })} testId="nav-schedule" />
      <NavItem icon={Monitor} label="Displays" count={snap.displays.length} on={is("displays")} onClick={() => go({ name: "displays" })} testId="nav-displays" />
      <NavItem icon={FolderOpen} label="Folders" count={snap.folders.length} on={is("folders")} onClick={() => go({ name: "folders" })} testId="nav-folders" />
      <NavItem icon={Cog} label="Settings" on={is("settings")} onClick={() => go({ name: "settings" })} testId="nav-settings" />
      {newPlaylist ? <NewPlaylist onClose={() => setNewPlaylist(false)} /> : null}
    </nav>
  );
}

function Player() {
  const snap = useStore((s) => s.snap)!;
  const byId = useStore((s) => s.byId);
  const progress = useStore((s) => s.progress);
  const now = useClock(1000);
  const np = snap.now;
  const primary = snap.displays.find((d) => d.primary) ?? snap.displays[0];
  const cur = primary ? byId.get(np.current[primary.id] ?? "") : undefined;
  const playing = np.playing;
  const total = np.nextAt && np.lastChangeAt ? np.nextAt - np.lastChangeAt : 0;
  const left = np.nextAt ? Math.max(0, np.nextAt - now) : 0;
  const frac = total > 0 ? 1 - left / total : 0;
  const busy = Object.values(progress)[0];
  const C = 2 * Math.PI * 28;

  return (
    <div className="player" data-testid="player">
      <div className="now">
        <button className="now-art" onClick={() => cur && openDetail(cur.id)} aria-label="Current wallpaper details">
          {cur ? <img key={cur.id} src={thumb(cur.id)} alt="" /> : null}
        </button>
        <div style={{ minWidth: 0 }}>
          <div className="now-title" data-testid="now-title">
            {cur ? cur.title : snap.wallpapers.length ? "Starting…" : "Add some wallpapers to begin"}
          </div>
          <div className="small" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} data-testid="now-source">
            {np.reason === "manual" ? "Playing" : np.reason === "schedule" ? "Scheduled:" : "Shuffling"} <b style={{ color: "var(--text)" }}>{np.playlistName}</b>
            {Object.keys(np.current).length > 1 ? ` · ${Object.keys(np.current).length} displays` : ""}
          </div>
        </div>
      </div>
      <div className="controls">
        <button className="round" aria-label="Previous wallpaper" onClick={() => void run(api.previous())} data-testid="prev">
          <SkipBack size={20} fill="currentColor" />
        </button>
        <button className="play" aria-label={playing ? "Pause" : "Play"} onClick={() => void run(api.setPlaying(np.pausedReason === "user"))} data-testid="play-pause" title={np.pausedReason === "battery" ? "Paused while on battery" : undefined}>
          <svg className="ring" viewBox="0 0 60 60" aria-hidden>
            <circle cx="30" cy="30" r="28" stroke="rgba(255,255,255,.12)" />
            <circle cx="30" cy="30" r="28" stroke="var(--accent)" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} strokeLinecap="round" transform="rotate(-90 30 30)" style={{ transition: "stroke-dashoffset 1s linear" }} />
          </svg>
          {np.pausedReason === "user" ? <Play size={22} fill="currentColor" /> : <Pause size={22} fill="currentColor" />}
        </button>
        <button className="round" aria-label="Next wallpaper" onClick={() => void run(api.next())} data-testid="next">
          <SkipForward size={20} fill="currentColor" />
        </button>
      </div>
      <div className="right">
        {busy ? (
          <div style={{ width: 200 }}>
            <div className="small" style={{ marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {busy.kind === "download" ? "Downloading" : busy.kind === "scan" ? "Scanning" : "Adding"} {busy.label.split(/[\\/]/).pop()}
            </div>
            <div className="bar">
              <i style={{ width: `${Math.round((busy.done / Math.max(1, busy.total)) * 100)}%` }} />
            </div>
          </div>
        ) : (
          <>
            <div style={{ textAlign: "right" }}>
              <div className="small mono" data-testid="next-in">
                {np.pausedReason === "battery" ? "Paused on battery" : np.pausedReason === "user" ? "Paused" : np.nextAt ? `Next in ${untilText(np.nextAt, now)}` : ""}
              </div>
              {np.scheduleNext ? (
                <div className="small" style={{ color: "var(--faint)" }}>
                  <CalendarDays size={11} style={{ verticalAlign: -1 }} /> {np.scheduleNext.playlistName} at {new Date(np.scheduleNext.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </div>
              ) : null}
            </div>
            <div className="upnext" aria-label="Up next">
              {np.upNext.slice(0, 4).map((id, i) => (
                <img key={`${id}-${i}`} src={thumb(id)} alt="" style={{ opacity: 1 - i * 0.18 }} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} data-testid="toast">
          {t.tone === "error" ? <TriangleAlert size={18} /> : t.tone === "info" ? <Info size={18} /> : <CheckCircle2 size={18} />}
          {t.message}
        </div>
      ))}
    </div>
  );
}
