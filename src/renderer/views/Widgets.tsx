import { useState, type ReactNode } from "react";
import { CalendarDays, Clock3, Copy, Cpu, CloudSun, Hourglass, Layers, LayoutTemplate, Move, Music2, StickyNote, Trash2, CalendarRange, MapPin } from "lucide-react";
import { CLOCK_FACES, FONTS, WIDGET_KINDS, WIDGET_THEMES, type AnyWidget, type WidgetKind, type WidgetStyle } from "../../shared/widgets.ts";
import { api, go, run, useStore } from "../store.ts";
import { Seg, Toggle } from "../ui/kit.tsx";
import { Stage } from "../widgets/Stage.tsx";

const KIND_ICON: Record<WidgetKind, typeof Clock3> = {
  clock: Clock3,
  date: CalendarDays,
  calendar: CalendarRange,
  stats: Cpu,
  weather: CloudSun,
  note: StickyNote,
  countdown: Hourglass,
  nowplaying: Music2,
};

const COLOURS = ["#FFFFFF", "#15131C", "#FFD36E", "#FF8FB1", "#7CFFB2", "#7CC7FF", "#C8A8FF", "#FF5FD2"];

export function WidgetsView() {
  const snap = useStore((s) => s.snap)!;
  const primary = snap.displays.find((d) => d.primary) ?? snap.displays[0]!;
  const [displayId, setDisplayId] = useState(primary.id);
  const display = snap.displays.find((d) => d.id === displayId) ?? primary;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const onDisplay = snap.widgets.filter((w) => w.display === display.id);
  const selected = snap.widgets.find((w) => w.id === selectedId) ?? null;

  const add = async (kind: WidgetKind) => {
    const id = await run(api.addWidget(kind, display.id));
    if (id) setSelectedId(id);
  };

  return (
    <div className="widgets-view">
      <div className="page-head">
        <div>
          <div className="eyebrow">Desktop widgets</div>
          <h1 className="title">
            Make the desktop <em>yours</em>
          </h1>
          <p className="subtitle">Clocks, the date, your calendar, system stats and weather, sitting on your wallpaper under your windows. Drag them on the preview.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => void run(api.setEditingWidgets(true))} disabled={!snap.settings.widgetsEnabled} data-testid="arrange-desktop" title="Move widgets on the real desktop">
            <Move size={16} /> Arrange on desktop
          </button>
        </div>
      </div>

      <div className="card tight widgets-switch">
        <Toggle
          label="Show widgets on the desktop"
          detail={snap.settings.widgetsEnabled ? `${snap.widgets.length} widget${snap.widgets.length === 1 ? "" : "s"} on ${snap.displays.length === 1 ? "your screen" : `${new Set(snap.widgets.map((w) => w.display)).size} screens`}` : "Hidden. Your layout is kept for when you turn them back on."}
          value={snap.settings.widgetsEnabled}
          onChange={(v) => void run(api.updateSettings({ widgetsEnabled: v }))}
          testId="widgets-enabled"
        />
        <div className="row" style={{ gap: 12 }}>
          <span className="small">Sit</span>
          <Seg
            value={snap.settings.widgetLayer}
            options={[
              { value: "desktop", label: "Under windows" },
              { value: "top", label: "Always on top" },
            ]}
            onChange={(v) => void run(api.updateSettings({ widgetLayer: v }))}
            testId="widget-layer"
          />
        </div>
      </div>

      <div className="themes" role="group" aria-label="Looks">
        <span className="small" style={{ marginRight: 4 }}>
          <LayoutTemplate size={14} style={{ verticalAlign: -2 }} /> One-click looks
        </span>
        {WIDGET_THEMES.map((t) => (
          <button key={t.id} className={`theme-pill t-${t.id}`} onClick={() => void run(api.applyWidgetTheme(t.id), `“${t.name}” look applied`)} disabled={!snap.widgets.length} data-testid={`theme-${t.id}`}>
            {t.name}
          </button>
        ))}
      </div>

      <div className="widgets-layout">
        <div className="widgets-stage">
          {snap.displays.length > 1 ? (
            <div className="row" style={{ marginBottom: 12 }}>
              <Seg value={display.id} options={snap.displays.map((d) => ({ value: d.id, label: `${d.label}${d.primary ? " (main)" : ""}` }))} onChange={(v) => setDisplayId(v)} testId="widget-display" />
            </div>
          ) : null}
          <Stage display={display} editing selected={selectedId} onSelect={setSelectedId} testId="widget-stage" />
          <h2 className="h2" style={{ marginTop: 30 }}>
            Add a widget
          </h2>
          <div className="gallery">
            {WIDGET_KINDS.map((k, i) => {
              const I = KIND_ICON[k.kind];
              const count = onDisplay.filter((w) => w.kind === k.kind).length;
              return (
                <button key={k.kind} className="gallery-card" style={{ animationDelay: `${i * 35}ms` }} onClick={() => void add(k.kind)} data-testid={`add-widget-${k.kind}`}>
                  <span className="gallery-icon">
                    <I size={22} />
                  </span>
                  <span className="h3">{k.name}</span>
                  <span className="small">{k.blurb}</span>
                  {count ? <span className="gallery-count">{count} on screen</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        <aside className="inspector" data-testid="inspector">
          {selected ? (
            <Inspector key={selected.id} w={selected} />
          ) : (
            <div className="inspector-empty">
              <Layers size={28} />
              <div className="h3">{onDisplay.length ? "Pick a widget to style it" : "Nothing on this screen yet"}</div>
              <div className="small">{onDisplay.length ? "Click one on the preview. Drag it to move it." : "Add a clock to start. Everything can be moved and restyled."}</div>
              {onDisplay.length ? (
                <div className="inspector-list">
                  {onDisplay.map((w) => {
                    const I = KIND_ICON[w.kind];
                    return (
                      <button key={w.id} className="nav-item" onClick={() => setSelectedId(w.id)} data-testid={`pick-widget-${w.kind}`}>
                        <I size={16} /> <span>{WIDGET_KINDS.find((k) => k.kind === w.kind)?.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="insp-section">
      <div className="insp-title">{title}</div>
      {children}
    </div>
  );
}

function Inspector({ w }: { w: AnyWidget }) {
  const snap = useStore((s) => s.snap)!;
  const I = KIND_ICON[w.kind];
  const opt = (options: Record<string, unknown>) => void run(api.updateWidget(w.id, { options }));
  const style = (s: Partial<WidgetStyle>) => void run(api.updateWidget(w.id, { style: s as WidgetStyle }));
  const [hex, setHex] = useState(w.style.color === "auto" ? "" : w.style.color);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row">
        <span className="gallery-icon small">
          <I size={18} />
        </span>
        <div className="grow">
          <div className="h3" data-testid="inspector-title">
            {WIDGET_KINDS.find((k) => k.kind === w.kind)?.name}
          </div>
          <div className="small">Drag it on the preview to move it</div>
        </div>
        <button className="btn icon ghost" aria-label="Duplicate widget" title="Duplicate" onClick={() => void run(api.duplicateWidget(w.id))} data-testid="duplicate-widget">
          <Copy size={16} />
        </button>
        <button className="btn icon ghost danger" aria-label="Remove widget" title="Remove" onClick={() => void run(api.removeWidget(w.id))} data-testid="remove-widget">
          <Trash2 size={16} />
        </button>
      </div>

      {w.kind === "clock" ? (
        <Section title="Face">
          <div className="face-grid">
            {CLOCK_FACES.map((f) => (
              <button key={f.id} className={`face${w.options.face === f.id ? " on" : ""}`} onClick={() => opt({ face: f.id })} data-testid={`face-${f.id}`} aria-pressed={w.options.face === f.id}>
                <FacePreview face={f.id} />
                <span>{f.name}</span>
              </button>
            ))}
          </div>
          <Toggle label="12-hour clock" value={w.options.hour12} onChange={(v) => opt({ hour12: v })} testId="opt-hour12" />
          <Toggle label="Seconds" value={w.options.seconds} onChange={(v) => opt({ seconds: v })} testId="opt-seconds" />
          <Toggle label="Date underneath" value={w.options.showDate} onChange={(v) => opt({ showDate: v })} />
          <Toggle label="Greeting" detail="“Good evening” above the time" value={w.options.greeting} onChange={(v) => opt({ greeting: v })} testId="opt-greeting" />
        </Section>
      ) : null}
      {w.kind === "date" ? (
        <Section title="Format">
          <Seg
            value={w.options.format}
            options={[
              { value: "long", label: "Long" },
              { value: "weekday", label: "Big day" },
              { value: "short", label: "Short" },
            ]}
            onChange={(v) => opt({ format: v })}
          />
        </Section>
      ) : null}
      {w.kind === "calendar" ? (
        <Section title="Weeks start on">
          <Seg
            value={w.options.weekStart}
            options={[
              { value: 1, label: "Monday" },
              { value: 0, label: "Sunday" },
            ]}
            onChange={(v) => opt({ weekStart: v })}
          />
        </Section>
      ) : null}
      {w.kind === "stats" ? (
        <Section title="Show">
          <Toggle label="CPU" value={w.options.cpu} onChange={(v) => opt({ cpu: v })} />
          <Toggle label="Memory" value={w.options.memory} onChange={(v) => opt({ memory: v })} />
          <Toggle label="Disk space" value={w.options.disk} onChange={(v) => opt({ disk: v })} />
          <Toggle label="Battery" detail="On laptops" value={w.options.battery} onChange={(v) => opt({ battery: v })} />
          <Toggle label="Time since start-up" value={w.options.uptime} onChange={(v) => opt({ uptime: v })} />
        </Section>
      ) : null}
      {w.kind === "weather" ? (
        <Section title="Weather">
          {snap.settings.location ? (
            <div className="small">
              <MapPin size={12} style={{ verticalAlign: -1 }} /> {snap.settings.location.name} · from Open-Meteo, every 20 minutes
            </div>
          ) : (
            <div className="notice">
              Weather needs your city.{" "}
              <button className="link" onClick={() => go({ name: "settings" })}>
                Set it in Settings
              </button>
            </div>
          )}
          <Seg
            value={w.options.units}
            options={[
              { value: "c", label: "°C" },
              { value: "f", label: "°F" },
            ]}
            onChange={(v) => opt({ units: v })}
          />
          <Toggle label="Today's high and low" value={w.options.showRange} onChange={(v) => opt({ showRange: v })} />
        </Section>
      ) : null}
      {w.kind === "note" ? (
        <Section title="Text">
          <textarea className="input" rows={3} defaultValue={w.options.text} maxLength={400} onChange={(e) => opt({ text: e.target.value })} aria-label="Note text" data-testid="note-text" />
        </Section>
      ) : null}
      {w.kind === "countdown" ? (
        <Section title="Counting down to">
          <input className="input" defaultValue={w.options.label} maxLength={60} onChange={(e) => opt({ label: e.target.value })} aria-label="What" placeholder="Holiday, launch day…" data-testid="countdown-label" />
          <input className="input" type="date" defaultValue={w.options.date} onChange={(e) => opt({ date: e.target.value })} aria-label="Date" data-testid="countdown-date" />
        </Section>
      ) : null}
      {w.kind === "nowplaying" ? (
        <Section title="Show">
          <Toggle label="The wallpaper's colours" value={w.options.palette} onChange={(v) => opt({ palette: v })} />
        </Section>
      ) : null}

      <Section title="Font">
        <div className="font-grid">
          {FONTS.map((f) => (
            <button key={f.id} className={`font-pill${w.style.font === f.id ? " on" : ""}`} style={{ fontFamily: f.css }} onClick={() => style({ font: f.id })} data-testid={`font-${f.id}`} aria-pressed={w.style.font === f.id}>
              <span className="aa">Aa</span>
              {f.name}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Colour">
        <div className="swatch-row">
          <button className={`swatch auto${w.style.color === "auto" ? " on" : ""}`} onClick={() => style({ color: "auto" })} title="Auto: reads well on the wallpaper" aria-label="Automatic colour" data-testid="colour-auto">
            A
          </button>
          {COLOURS.map((c) => (
            <button
              key={c}
              className={`swatch${w.style.color.toUpperCase() === c ? " on" : ""}`}
              style={{ background: c }}
              aria-label={`Colour ${c}`}
              onClick={() => {
                setHex(c);
                style({ color: c });
              }}
            />
          ))}
          <input
            className="input hex"
            value={hex}
            placeholder="#hex"
            maxLength={7}
            aria-label="Colour code"
            onChange={(e) => {
              setHex(e.target.value);
              if (/^#[0-9a-f]{6}$/i.test(e.target.value)) style({ color: e.target.value });
            }}
          />
        </div>
      </Section>

      <Section title="Size and look">
        <label className="slider">
          <span>Size</span>
          <input type="range" min={0.5} max={3} step={0.05} value={w.style.scale} onChange={(e) => style({ scale: Number(e.target.value) })} data-testid="widget-size" />
          <b>{Math.round(w.style.scale * 100)}%</b>
        </label>
        <label className="slider">
          <span>Opacity</span>
          <input type="range" min={0.2} max={1} step={0.05} value={w.style.opacity} onChange={(e) => style({ opacity: Number(e.target.value) })} />
          <b>{Math.round(w.style.opacity * 100)}%</b>
        </label>
        <div className="row wrap" style={{ gap: 10 }}>
          <Seg
            value={w.style.panel}
            options={[
              { value: "none", label: "No panel" },
              { value: "glass", label: "Glass" },
              { value: "solid", label: "Solid" },
            ]}
            onChange={(v) => style({ panel: v })}
            testId="widget-panel"
          />
          <Seg
            value={w.style.align}
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Centre" },
              { value: "right", label: "Right" },
            ]}
            onChange={(v) => style({ align: v })}
          />
        </div>
        <Toggle label="Soft shadow" detail="Keeps text readable on busy pictures" value={w.style.shadow} onChange={(v) => style({ shadow: v })} />
      </Section>

      {snap.displays.length > 1 ? (
        <Section title="Screen">
          <Seg value={w.display} options={snap.displays.map((d) => ({ value: d.id, label: d.label }))} onChange={(v) => void run(api.updateWidget(w.id, { display: v }))} />
        </Section>
      ) : null}
    </div>
  );
}

function FacePreview({ face }: { face: string }) {
  switch (face) {
    case "stacked":
      return (
        <span className="fp stacked">
          21
          <br />
          <i>16</i>
        </span>
      );
    case "words":
      return <span className="fp words">quarter past nine</span>;
    case "analog":
      return (
        <svg className="fp" viewBox="0 0 40 40" width="34" height="34" aria-hidden>
          <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeOpacity=".5" strokeWidth="2" />
          <line x1="20" y1="20" x2="20" y2="9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="20" y1="20" x2="28" y2="23" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case "neon":
      return <span className="fp neon">21:16</span>;
    case "minimal":
      return <span className="fp minimal">21:16 · Tue</span>;
    default:
      return <span className="fp classic">21:16</span>;
  }
}
