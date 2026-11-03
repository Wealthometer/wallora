import { useState } from "react";
import { Heart, MonitorPlay, MoreHorizontal, X } from "lucide-react";
import { hueOf } from "../../shared/color.ts";
import { resolutionLabel, sharpness } from "../../shared/displays.ts";
import { api, full, getState, run, toast, useStore } from "../store.ts";
import { wallpaperMenu } from "./actions.tsx";
import { agoText, bytesText, Menu, useClock } from "./kit.tsx";

/** A wallpaper up close: big preview, palette, how sharp it'll look on each display, and actions. */
export function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const w = useStore((s) => s.byId.get(id));
  const snap = useStore((s) => s.snap)!;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const now = useClock(30_000);
  if (!w) return null;
  const collections = (snap.membership[w.id] ?? []).map((cid) => snap.collections.find((c) => c.id === cid)?.name).filter(Boolean);
  const showingOn = snap.displays.filter((d) => snap.now.current[d.id] === w.id);
  const SOURCE = { folder: "Watched folder", import: "Added by you", wallhaven: "Wallhaven", bing: "Bing image of the day" } as const;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" aria-label={w.title} data-testid="detail">
        <div style={{ position: "relative" }}>
          <img className="preview" src={full(w.id)} alt="" />
          <button className="btn icon" style={{ position: "absolute", top: 14, right: 14, background: "rgba(0,0,0,.45)" }} aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="body">
          <div>
            <div className="eyebrow">{resolutionLabel(w.width, w.height)} · {hueOf(w.accent)}</div>
            <h2 className="title" style={{ fontSize: 40 }} data-testid="detail-title">
              {w.title}
            </h2>
            {w.credit ? <div className="small">{w.credit}</div> : null}
            {showingOn.length ? <div className="small" style={{ color: "var(--accent)", marginTop: 6 }}>Showing now on {showingOn.map((d) => d.label).join(" and ")}</div> : null}
          </div>

          <div className="row">
            <button className="btn primary big" onClick={() => void run(api.show(w.id, null), "Wallpaper set")} disabled={w.missing} data-testid="detail-set">
              <MonitorPlay size={18} /> Set as wallpaper
            </button>
            <button className={`btn icon big${w.favourite ? " primary" : ""}`} style={{ width: 50 }} aria-label={w.favourite ? "Remove from favourites" : "Add to favourites"} aria-pressed={w.favourite} onClick={() => void run(api.favourite([w.id], !w.favourite))} data-testid="detail-favourite">
              <Heart size={18} fill={w.favourite ? "currentColor" : "none"} />
            </button>
            <button className="btn icon big" style={{ width: 50 }} aria-label="More" onClick={(e) => setMenu({ x: e.clientX - 200, y: e.clientY + 10 })} data-testid="detail-more">
              <MoreHorizontal size={18} />
            </button>
          </div>
          {w.missing ? <div className="card" style={{ borderColor: "var(--danger)" }}>This file isn't where it used to be. Put it back, or rescan its folder, and it'll play again.</div> : null}

          <div>
            <div className="h3" style={{ marginBottom: 10 }}>Palette</div>
            <div className="palette">
              {w.colors.map((c, i) => (
                <button
                  key={c}
                  style={{ background: c, animationDelay: `${i * 60}ms` }}
                  aria-label={`Copy ${c}`}
                  onClick={() => void navigator.clipboard.writeText(c).then(() => toast(`Copied ${c}`))}
                >
                  <span>{c}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="h3" style={{ marginBottom: 10 }}>On your displays</div>
            <div className="stack" style={{ gap: 6 }}>
              {snap.displays.map((d) => {
                const s = sharpness(w, d.pixels, snap.settings.fit);
                return (
                  <div key={d.id} className="row small">
                    <span className="grow">
                      {d.label} · {d.pixels.width}×{d.pixels.height}
                    </span>
                    <span className="badge" style={{ background: s === "sharp" ? "rgba(94,230,168,.2)" : s === "soft" ? "rgba(255,200,80,.2)" : "rgba(255,107,129,.2)", color: s === "sharp" ? "var(--ok)" : s === "soft" ? "#ffc850" : "var(--danger)" }}>
                      {s === "sharp" ? "Sharp" : s === "soft" ? "Slightly soft" : "Blurry"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <dl className="kv">
            <dt>Size</dt>
            <dd>
              {w.width} × {w.height} · {bytesText(w.bytes)}
            </dd>
            <dt>Brightness</dt>
            <dd>{Math.round(w.luminance * 100)}% · {w.luminance >= 0.5 ? "light" : "dark"}</dd>
            <dt>From</dt>
            <dd>{SOURCE[w.source]}</dd>
            <dt>Shown</dt>
            <dd>{w.showCount ? `${w.showCount}×, last ${agoText(w.lastShownAt!, now)}` : "Not yet"}</dd>
            <dt>Added</dt>
            <dd>{new Date(w.addedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</dd>
            {collections.length ? (
              <>
                <dt>Collections</dt>
                <dd>{collections.join(", ")}</dd>
              </>
            ) : null}
            <dt>File</dt>
            <dd className="small">{w.path}</dd>
          </dl>
        </div>
      </aside>
      {menu ? <Menu at={menu} items={wallpaperMenu([w.id])} onClose={() => setMenu(null)} /> : null}
    </>
  );
}

export function currentWallpaper() {
  const s = getState().snap;
  if (!s) return null;
  const d = s.displays.find((x) => x.primary) ?? s.displays[0];
  return d ? (getState().byId.get(s.now.current[d.id] ?? "") ?? null) : null;
}
