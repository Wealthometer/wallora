import { useState } from "react";
import { FolderOpen, KeyRound, MapPin } from "lucide-react";
import { CITIES } from "../../shared/cities.ts";
import { sunTimes } from "../../shared/sun.ts";
import { api, run, useStore } from "../store.ts";
import { Field, Toggle } from "../ui/kit.tsx";

export function SettingsView() {
  const snap = useStore((s) => s.snap)!;
  const s = snap.settings;
  const [city, setCity] = useState("");
  const [lat, setLat] = useState(s.location ? String(s.location.lat) : "");
  const [lng, setLng] = useState(s.location ? String(s.location.lng) : "");
  const [key, setKey] = useState(s.wallhavenKey);
  const matches = city.trim().length >= 2 ? CITIES.filter((c) => c.name.toLowerCase().includes(city.trim().toLowerCase())).slice(0, 6) : [];
  const sun = s.location ? sunTimes(new Date(), s.location.lat, s.location.lng) : null;
  const t = (d: Date | null) => (d ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—");
  const set = (patch: Parameters<typeof api.updateSettings>[0], msg?: string) => void run(api.updateSettings(patch), msg);

  return (
    <div style={{ maxWidth: 780 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Settings</div>
          <h1 className="title">Settings</h1>
        </div>
      </div>

      <h2 className="h3 muted">Running</h2>
      <div className="card tight" style={{ marginTop: 10 }}>
        <Toggle label={snap.desktop.platform === "win32" ? "Start with Windows" : "Start when you sign in"} detail="Open in the background when you sign in, so wallpapers keep changing" value={s.launchAtLogin} onChange={(v) => set({ launchAtLogin: v })} testId="set-login" />
        <div className="divider" />
        <Toggle label="Keep running in the tray when closed" detail="Closing the window hides it; quit from the tray icon" value={s.closeToTray} onChange={(v) => set({ closeToTray: v })} testId="set-tray" />
        <div className="divider" />
        <Toggle label="Start hidden" detail="Don't open the window on launch" value={s.startHidden} onChange={(v) => set({ startHidden: v })} />
        <div className="divider" />
        <Toggle label="Pause on battery" detail="Save power on laptops: no changes while unplugged" value={s.pauseOnBattery} onChange={(v) => set({ pauseOnBattery: v })} testId="set-battery" />
        <div className="divider" />
        <Toggle
          label="Keyboard shortcuts"
          detail={`${snap.desktop.platform === "darwin" ? "⌘" : "Ctrl"}+Alt+→ next · ${snap.desktop.platform === "darwin" ? "⌘" : "Ctrl"}+Alt+← previous · ${snap.desktop.platform === "darwin" ? "⌘" : "Ctrl"}+Alt+Space pause, from anywhere`}
          value={s.shortcuts}
          onChange={(v) => set({ shortcuts: v })}
        />
      </div>

      <h2 className="h3 muted section">Look</h2>
      <div className="card tight" style={{ marginTop: 10 }}>
        <Toggle label="Colour from the wallpaper" detail="Wallora's accent colour follows the picture on your main display" value={s.liveAccent} onChange={(v) => set({ liveAccent: v })} testId="set-accent" />
      </div>

      <h2 className="h3 muted section">
        <MapPin size={14} style={{ verticalAlign: -2 }} /> Location, for sunrise and sunset
      </h2>
      <div className="card stack" style={{ marginTop: 10 }}>
        <p className="small" style={{ margin: 0 }}>
          Used only on this computer to work out when the sun rises and sets. Nothing is looked up online.
        </p>
        {s.location ? (
          <div className="row">
            <b className="grow" data-testid="location-name">
              {s.location.name || `${s.location.lat.toFixed(3)}, ${s.location.lng.toFixed(3)}`}
            </b>
            <span className="small">
              Sunrise {t(sun?.sunrise ?? null)} · sunset {t(sun?.sunset ?? null)}
            </span>
            <button className="btn small" onClick={() => set({ location: null }, "Location removed")}>
              Remove
            </button>
          </div>
        ) : null}
        <Field label="Find a city">
          <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lagos, London, Tokyo…" data-testid="city-search" />
        </Field>
        {matches.length ? (
          <div className="row wrap" style={{ gap: 6 }}>
            {matches.map((c) => (
              <button
                key={c.name}
                className="chip"
                data-testid={`city-${c.name}`}
                onClick={() => {
                  setCity("");
                  setLat(String(c.lat));
                  setLng(String(c.lng));
                  set({ location: c }, `Location set to ${c.name}`);
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        ) : null}
        <div className="row">
          <Field label="Latitude">
            <input className="input" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="6.5244" />
          </Field>
          <Field label="Longitude">
            <input className="input" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="3.3792" />
          </Field>
          <button
            className="btn"
            style={{ alignSelf: "flex-end" }}
            onClick={() => {
              const a = Number(lat.replace(",", "."));
              const b = Number(lng.replace(",", "."));
              if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return void run(Promise.reject(new Error("Latitude is −90 to 90 and longitude −180 to 180")));
              set({ location: { name: "", lat: a, lng: b } }, "Location set");
            }}
          >
            Use these
          </button>
        </div>
      </div>

      <h2 className="h3 muted section">Downloads</h2>
      <div className="card stack" style={{ marginTop: 10 }}>
        <div className="row">
          <FolderOpen size={18} />
          <span className="grow small" data-testid="download-folder">
            {s.downloadFolder || "Pictures › Wallora"}
          </span>
          <button className="btn small" onClick={() => void run(api.chooseDownloadFolder())}>
            Change
          </button>
        </div>
        <Field label="Wallhaven API key (optional)">
          <div className="row">
            <KeyRound size={18} />
            <input className="input grow" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Only needed if Wallhaven limits your searches" type="password" />
            <button className="btn small" onClick={() => set({ wallhavenKey: key }, "Saved")}>
              Save
            </button>
          </div>
        </Field>
      </div>

      <p className="small section">
        Wallora {snap.version} · wallpapers set through {snap.desktop.name}
      </p>
    </div>
  );
}
