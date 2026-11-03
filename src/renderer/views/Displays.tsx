import { Monitor } from "lucide-react";
import { arrangement } from "../../shared/displays.ts";
import type { DisplayMode, Fit } from "../../shared/types.ts";
import { api, run, thumb, useStore } from "../store.ts";
import { Field, Seg } from "../ui/kit.tsx";

const FITS: { value: Fit; label: string; detail: string }[] = [
  { value: "fill", label: "Fill", detail: "Covers the screen, cropping edges if the shape differs" },
  { value: "fit", label: "Fit", detail: "Whole picture visible, with bars if needed" },
  { value: "stretch", label: "Stretch", detail: "Fills exactly, distorting the shape" },
  { value: "center", label: "Centre", detail: "Actual size in the middle" },
  { value: "tile", label: "Tile", detail: "Repeated across the screen" },
  { value: "span", label: "Span", detail: "One picture across all displays (Windows)" },
];

export function DisplaysView() {
  const snap = useStore((s) => s.snap)!;
  const byId = useStore((s) => s.byId);
  const s = snap.settings;
  const W = 760;
  const H = 240;
  const map = arrangement(snap.displays, W, H, 14);
  const multi = snap.displays.length > 1;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Displays</div>
          <h1 className="title">
            {snap.displays.length} {snap.displays.length === 1 ? "screen" : "screens"}, <em>your way</em>
          </h1>
          <p className="subtitle">Changing wallpapers through {snap.desktop.name}.</p>
        </div>
      </div>

      <div className="monitors" style={{ maxWidth: W + 40, height: H + 40 }} data-testid="monitors">
        {map.map((m) => {
          const d = snap.displays.find((x) => x.id === m.id)!;
          const w = byId.get(snap.now.current[d.id] ?? "");
          return (
            <div key={m.id} className={`monitor${d.primary ? " primary" : ""}`} style={{ left: m.x + 20, top: m.y + 20, width: m.w, height: m.h }}>
              {w ? <img src={thumb(w.id)} alt="" /> : null}
              <span className="badge tag">
                <Monitor size={11} /> {d.label} · {d.pixels.width}×{d.pixels.height}
                {d.primary ? " · main" : ""}
              </span>
            </div>
          );
        })}
      </div>

      <div className="section stack" style={{ gap: 20, maxWidth: 760 }}>
        {multi ? (
          <Field label="With more than one display">
            <Seg<DisplayMode>
              value={snap.desktop.perDisplay ? s.displayMode : "same"}
              onChange={(displayMode) => void run(api.updateSettings({ displayMode }))}
              testId="display-mode"
              options={[
                { value: "same", label: "Same everywhere" },
                { value: "different", label: "A different one on each" },
                { value: "perDisplay", label: "Own playlist each" },
              ]}
            />
            {!snap.desktop.perDisplay ? <span className="small">{snap.desktop.name} shows one picture on all displays, so Wallora does too.</span> : null}
          </Field>
        ) : null}

        {multi && s.displayMode === "perDisplay" && snap.desktop.perDisplay ? (
          <div className="card stack">
            {snap.displays.map((d) => (
              <div key={d.id} className="row">
                <span className="grow h3">{d.label}</span>
                <select
                  className="input"
                  value={s.displayPlaylists[d.id] ?? ""}
                  onChange={(e) => {
                    const next = { ...s.displayPlaylists };
                    if (e.target.value) next[d.id] = e.target.value;
                    else delete next[d.id];
                    void run(api.updateSettings({ displayPlaylists: next }));
                  }}
                  aria-label={`Playlist for ${d.label}`}
                >
                  <option value="">Whatever's playing</option>
                  {snap.playlists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        ) : null}

        <Field label="How pictures fit the screen">
          <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {FITS.filter((f) => f.value !== "span" || snap.desktop.platform === "win32" || snap.desktop.name.includes("GNOME")).map((f) => (
              <button key={f.value} className={`card${s.fit === f.value ? "" : ""}`} style={{ textAlign: "left", padding: 14, cursor: "pointer", borderColor: s.fit === f.value ? "var(--accent)" : undefined, boxShadow: s.fit === f.value ? "0 0 0 1px var(--accent) inset" : undefined }} onClick={() => void run(api.updateSettings({ fit: f.value }))} aria-pressed={s.fit === f.value} data-testid={`fit-${f.value}`}>
                <div className="h3">{f.label}</div>
                <div className="small">{f.detail}</div>
              </button>
            ))}
          </div>
        </Field>
      </div>
    </div>
  );
}
