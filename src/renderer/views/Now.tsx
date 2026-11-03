import { Compass, FolderPlus, Heart, ImagePlus, Info, LayoutDashboard, SkipForward, Sparkles } from "lucide-react";
import { api, go, openDetail, run, thumb, toast, useStore } from "../store.ts";
import { Stage } from "../widgets/Stage.tsx";
import { addPictures } from "../ui/actions.tsx";
import { untilText, useClock } from "../ui/kit.tsx";

export function NowView() {
  const snap = useStore((s) => s.snap)!;
  const byId = useStore((s) => s.byId);
  const now = useClock(5000);
  const np = snap.now;
  const primary = snap.displays.find((d) => d.primary) ?? snap.displays[0];
  const cur = primary ? byId.get(np.current[primary.id] ?? "") : undefined;

  if (!snap.wallpapers.length) return <Welcome />;

  return (
    <>
      <section className="now-stage">
        <div className="now-copy">
          <div className="eyebrow">{np.reason === "library" ? "Shuffling your library" : `${np.reason === "schedule" ? "On schedule" : "Now playing"} · ${np.playlistName}`}</div>
          <h1 className="title now-title-big" data-testid="hero-title">
            {cur ? cur.title : "Getting ready…"}
          </h1>
          <div className="subtitle">
            {cur ? `${cur.width}×${cur.height}` : ""}
            {np.nextAt && np.playing ? ` · next in ${untilText(np.nextAt, now)}` : np.pausedReason === "battery" ? " · paused while on battery" : np.pausedReason === "user" ? " · paused" : ""}
            {cur?.credit ? ` · ${cur.credit}` : ""}
          </div>
          {cur ? (
            <>
              <div className="palette">
                {cur.colors.slice(0, 5).map((c, i) => (
                  <button key={`${cur.id}-${c}`} style={{ background: c, animationDelay: `${i * 70}ms` }} aria-label={`Copy ${c}`} onClick={() => void navigator.clipboard.writeText(c).then(() => toast(`Copied ${c}`))}>
                    <span>{c}</span>
                  </button>
                ))}
              </div>
              <div className="row wrap" style={{ marginTop: 22 }}>
                <button className="btn primary big" onClick={() => void run(api.next())} data-testid="now-next">
                  <SkipForward size={17} fill="currentColor" /> Next
                </button>
                <button className={`btn big${cur.favourite ? " on" : ""}`} onClick={() => void run(api.favourite([cur.id], !cur.favourite))} data-testid="now-favourite" aria-pressed={cur.favourite}>
                  <Heart size={16} fill={cur.favourite ? "currentColor" : "none"} /> {cur.favourite ? "Favourite" : "Love it"}
                </button>
                <button className="btn icon big" onClick={() => openDetail(cur.id)} aria-label="Details" title="Details">
                  <Info size={17} />
                </button>
              </div>
            </>
          ) : null}
        </div>
        {primary ? (
          <div className="now-screen">
            <Stage display={primary} testId="now-stage" />
            <button className="btn small ghost now-widgets-link" onClick={() => go({ name: "widgets" })}>
              <LayoutDashboard size={14} /> {snap.widgets.length ? "Edit widgets" : "Add a clock to your desktop"}
            </button>
          </div>
        ) : null}
      </section>

      <div style={{ padding: "0 34px" }}>
        {snap.displays.length > 1 ? (
          <div className="section">
            <h2 className="h2">On each display</h2>
            <div className="grid big" style={{ marginTop: 14 }}>
              {snap.displays.map((d) => {
                const w = byId.get(np.current[d.id] ?? "");
                return (
                  <button key={d.id} className="tile" onClick={() => w && openDetail(w.id)} aria-label={`${d.label}: ${w?.title ?? "nothing yet"}`}>
                    {w ? <img src={thumb(w.id)} alt="" /> : null}
                    <div className="shade" style={{ opacity: 1 }}>
                      <span className="name">{d.label}</span>
                      <span className="small" style={{ color: "#fff" }}>{w?.title}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="section">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="h2">Up next</h2>
            {np.reason === "manual" ? (
              <button className="btn small" onClick={() => void run(api.followSchedule(), "Back on schedule")}>
                Follow the schedule again
              </button>
            ) : null}
          </div>
          {np.upNext.length ? (
            <div className="filmstrip" data-testid="up-next">
              {np.upNext.slice(0, 8).map((id, i) => {
                const w = byId.get(id);
                if (!w) return null;
                return (
                  <button key={`${id}-${i}`} className="tile" style={{ animationDelay: `${i * 40}ms` }} onClick={() => openDetail(id)} aria-label={w.title}>
                    <img src={thumb(id)} alt="" />
                    <div className="badges">
                      <span className="badge">{i + 1}</span>
                    </div>
                    <div className="shade">
                      <span className="name">{w.title}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="muted">Nothing queued. Add wallpapers to “{np.playlistName}”.</p>
          )}
        </div>

        <div className="section row wrap" style={{ gap: 14 }}>
          <Stat label="Wallpapers" value={snap.wallpapers.length} onClick={() => go({ name: "library" })} />
          <Stat label="Favourites" value={snap.wallpapers.filter((w) => w.favourite).length} onClick={() => go({ name: "library", filter: "favourites" })} />
          <Stat label="Playlists" value={snap.playlists.length} onClick={() => snap.playlists[0] && go({ name: "playlist", id: snap.playlists[0].id })} />
          <Stat label="Shown today" value={snap.history.filter((h) => h.at > new Date().setHours(0, 0, 0, 0)).length} onClick={() => go({ name: "history" })} />
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <button className="card" style={{ minWidth: 170, textAlign: "left", cursor: "pointer" }} onClick={onClick}>
      <div className="title" style={{ fontSize: 44, margin: 0 }}>
        {value}
      </div>
      <div className="small">{label}</div>
    </button>
  );
}

function Welcome() {
  const now = useClock(15_000);
  const d = new Date(now);
  return (
    <div className="welcome">
      <div className="welcome-top">
        <div className="welcome-copy">
          <div className="eyebrow">
            <Sparkles size={13} style={{ verticalAlign: -2 }} /> Welcome
          </div>
          <h1 className="title" style={{ fontSize: "clamp(56px, 6vw, 84px)" }}>
            Your desktop, <em>always new</em>.
          </h1>
          <p className="subtitle" style={{ maxWidth: 520, fontSize: 17 }}>
            Wallora plays wallpapers like music: playlists, shuffle, a schedule for mornings and nights, a different picture on every screen, and widgets like clocks and weather right on your desktop. Start by bringing some pictures in.
          </p>
        </div>
        <div className="welcome-art" aria-hidden>
          <div className="welcome-glow" />
          <div className="welcome-clock">
            <div className="welcome-time">{d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</div>
            <div className="welcome-date">{d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div>
          </div>
          <div className="welcome-cards">
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
      <div className="grid" style={{ marginTop: 40, gridTemplateColumns: "repeat(3, 1fr)" }}>
        <Start icon={FolderPlus} title="Watch a folder" body="Point Wallora at your Pictures or a wallpapers folder. New files show up by themselves." onClick={() => void run(api.addFolder())} testId="welcome-folder" />
        <Start icon={ImagePlus} title="Add pictures" body="Pick a few files. Wallora keeps its own copy, so moving the originals won't break anything." onClick={() => void addPictures()} testId="welcome-import" />
        <Start icon={Compass} title="Discover" body="Browse Wallhaven's top wallpapers and Bing's photo of the day, and download in a click." onClick={() => go({ name: "discover" })} testId="welcome-discover" />
      </div>
    </div>
  );
}

function Start({ icon: I, title, body, onClick, testId }: { icon: typeof Compass; title: string; body: string; onClick: () => void; testId: string }) {
  return (
    <button className="cover-card" style={{ padding: 22, gap: 14 }} onClick={onClick} data-testid={testId}>
      <div className="empty" style={{ padding: 0, alignItems: "flex-start" }}>
        <div className="orb" style={{ width: 64, height: 64, borderRadius: 22 }}>
          <I size={28} />
        </div>
      </div>
      <div className="h3" style={{ fontSize: 17 }}>
        {title}
      </div>
      <div className="small">{body}</div>
    </button>
  );
}
