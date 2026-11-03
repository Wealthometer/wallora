import { useState } from "react";
import { GripVertical, ListMusic, Pause, Play, Plus, Shuffle, Sun, Trash2, Wand2, X, Repeat } from "lucide-react";
import { HUES } from "../../shared/color.ts";
import { describeRules, EMPTY_RULES, matches } from "../../shared/smart.ts";
import type { Playlist, SmartRules, Source, Tone } from "../../shared/types.ts";
import { api, go, openDetail, run, thumb, useStore } from "../store.ts";
import { Empty, Field, Modal, Mosaic, plural, Seg, Toggle } from "../ui/kit.tsx";

export const INTERVALS = [
  { value: 1, label: "Every minute" },
  { value: 5, label: "Every 5 minutes" },
  { value: 10, label: "Every 10 minutes" },
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every hour" },
  { value: 120, label: "Every 2 hours" },
  { value: 360, label: "Every 6 hours" },
  { value: 720, label: "Every 12 hours" },
  { value: 1440, label: "Once a day" },
  { value: 10080, label: "Once a week" },
];

export function intervalText(min: number): string {
  return INTERVALS.find((i) => i.value === min)?.label.toLowerCase() ?? `every ${min} minutes`;
}

export function PlaylistView({ id }: { id: string }) {
  const snap = useStore((s) => s.snap)!;
  const byId = useStore((s) => s.byId);
  const p = snap.playlists.find((x) => x.id === id);
  const [picking, setPicking] = useState(false);
  const [editingRules, setEditingRules] = useState(false);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const [name, setName] = useState<string | null>(null);
  if (!p) return <Empty icon={ListMusic} title="This playlist is gone" />;

  const np = snap.now;
  const playingThis = np.playlistId === p.id && np.playing;
  const currentIds = new Set(Object.values(np.current));
  const colors = p.cover.map((cid) => byId.get(cid)?.accent).filter(Boolean) as string[];
  const head = colors.length ? `linear-gradient(120deg, ${colors[0]}88, ${(colors[1] ?? colors[0])!}44)` : undefined;
  const items = p.items.map((wid) => byId.get(wid)).filter((w) => !!w);
  const collectionName = (cid: string) => snap.collections.find((c) => c.id === cid)?.name ?? "a deleted collection";
  const rulesUsingIt = snap.rules.filter((r) => r.playlistId === p.id).length;

  const reorder = (from: number, to: number) => {
    if (from === to) return;
    const ids = [...p.items];
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved!);
    void run(api.setPlaylistItems(p.id, ids));
  };

  return (
    <>
      <header className="pl-head" style={{ ["--head" as string]: head }}>
        <Mosaic ids={p.cover} empty={<ListMusic size={56} />} />
        <div className="grow">
          <div className="eyebrow">{p.smart ? "Smart playlist" : "Playlist"}</div>
          {name === null ? (
            <h1 className="title" style={{ fontSize: 64, cursor: "text" }} onClick={() => setName(p.name)} title="Click to rename" data-testid="playlist-title">
              {p.name}
            </h1>
          ) : (
            <input
              className="input"
              style={{ fontFamily: "var(--display)", fontSize: 44, height: 70, margin: "6px 0", width: "100%" }}
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                void run(api.updatePlaylist(p.id, { name }));
                setName(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              data-testid="playlist-name-input"
            />
          )}
          <p className="subtitle">
            {plural(items.length, "wallpaper")} · {intervalText(p.interval)} · {p.shuffle ? "shuffled" : "in order"}
            {p.matchDaylight ? " · matches daylight" : ""}
            {rulesUsingIt ? ` · in ${plural(rulesUsingIt, "schedule rule")}` : ""}
          </p>
          {p.smart ? <p className="small" style={{ marginTop: 6 }}>{describeRules(p.smart, collectionName)}</p> : null}
          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn primary big" onClick={() => void run<unknown>(playingThis ? api.setPlaying(false) : api.play(p.id))} disabled={!items.length} data-testid="play-playlist">
              {playingThis ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />} {playingThis ? "Pause" : "Play"}
            </button>
            <button className={`btn icon big${p.shuffle ? " primary" : ""}`} style={{ width: 50 }} aria-label="Shuffle" aria-pressed={p.shuffle} onClick={() => void run(api.updatePlaylist(p.id, { shuffle: !p.shuffle }))} data-testid="shuffle" title={p.shuffle ? "Shuffled" : "In order"}>
              {p.shuffle ? <Shuffle size={18} /> : <Repeat size={18} />}
            </button>
            <select className="input" style={{ height: 50, borderRadius: 25 }} value={p.interval} onChange={(e) => void run(api.updatePlaylist(p.id, { interval: Number(e.target.value) }))} aria-label="Change every" data-testid="interval">
              {INTERVALS.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
            {p.smart ? (
              <button className="btn big" onClick={() => setEditingRules(true)} data-testid="edit-rules">
                <Wand2 size={16} /> Edit rules
              </button>
            ) : (
              <button className="btn big" onClick={() => setPicking(true)} data-testid="add-wallpapers">
                <Plus size={16} /> Add wallpapers
              </button>
            )}
            <button
              className="btn icon big danger"
              style={{ width: 50 }}
              aria-label="Delete playlist"
              data-testid="delete-playlist"
              onClick={() => {
                go({ name: "now" });
                void run(api.deletePlaylist(p.id), `Deleted “${p.name}”`);
              }}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </header>

      <div style={{ padding: "0 34px" }}>
        <div className="card tight" style={{ marginBottom: 22 }}>
          <Toggle
            label="Match the daylight"
            detail={snap.settings.location ? `Brighter wallpapers while the sun is up in ${snap.settings.location.name || "your area"}, darker ones after dark.` : "Brighter wallpapers in the day, darker ones at night. Set your location in Settings to follow real sunrise and sunset."}
            value={p.matchDaylight}
            onChange={(v) => void run(api.updatePlaylist(p.id, { matchDaylight: v }))}
            testId="match-daylight"
          />
        </div>

        {items.length ? (
          <div className="tracks" data-testid="tracks">
            {items.map((w, i) => (
              <div
                key={w.id}
                className={`track${currentIds.has(w.id) ? " current" : ""}${drag?.from === i ? " dragging" : ""}${drag && drag.over === i && drag.from !== i ? " over" : ""}`}
                draggable={!p.smart}
                onDragStart={() => setDrag({ from: i, over: i })}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (drag && drag.over !== i) setDrag({ ...drag, over: i });
                }}
                onDragEnd={() => setDrag(null)}
                onDrop={() => {
                  if (drag) reorder(drag.from, i);
                  setDrag(null);
                }}
                onDoubleClick={() => void run(api.show(w.id, null))}
                data-testid={`track-${w.title}`}
              >
                <span className="n">{currentIds.has(w.id) ? <Sun size={14} /> : i + 1}</span>
                <img src={thumb(w.id)} alt="" />
                <div style={{ minWidth: 0 }}>
                  <div className="h3" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }} onClick={() => openDetail(w.id)}>
                    {w.title}
                  </div>
                  <div className="small">
                    {w.width}×{w.height} · {w.luminance >= 0.5 ? "light" : "dark"}
                  </div>
                </div>
                <div className="row" style={{ gap: 3 }}>
                  {w.colors.slice(0, 4).map((c) => (
                    <i key={c} style={{ width: 12, height: 12, borderRadius: 4, background: c, display: "inline-block" }} />
                  ))}
                </div>
                <div className="row" style={{ gap: 2 }}>
                  <button className="btn icon small ghost" aria-label={`Show ${w.title} now`} onClick={() => void run(api.show(w.id, null))}>
                    <Play size={14} />
                  </button>
                  {!p.smart ? (
                    <>
                      <button className="btn icon small ghost" aria-label={`Take ${w.title} out`} onClick={() => void run(api.removeFromPlaylist(p.id, [w.id]))} data-testid={`untrack-${w.title}`}>
                        <X size={14} />
                      </button>
                      <GripVertical size={16} style={{ color: "var(--faint)", cursor: "grab" }} />
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={ListMusic} title={p.smart ? "Nothing matches these rules yet" : "An empty playlist"}>
            <p style={{ margin: 0 }}>{p.smart ? "Loosen the rules, or add more wallpapers to your library." : "Add wallpapers here, or right-click any wallpaper and choose “Add to playlist”."}</p>
          </Empty>
        )}
      </div>

      {picking ? <Picker playlist={p} onClose={() => setPicking(false)} /> : null}
      {editingRules && p.smart ? (
        <Modal title="Smart playlist rules" onClose={() => setEditingRules(false)}>
          <RulesEditor
            initial={p.smart}
            onSave={(smart) => {
              setEditingRules(false);
              void run(api.updatePlaylist(p.id, { smart }));
            }}
          />
        </Modal>
      ) : null}
    </>
  );
}

function Picker({ playlist, onClose }: { playlist: Playlist; onClose: () => void }) {
  const snap = useStore((s) => s.snap)!;
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const have = new Set(playlist.items);
  const list = snap.wallpapers.filter((w) => !have.has(w.id) && !w.missing);
  return (
    <Modal title={`Add to ${playlist.name}`} onClose={onClose} testId="picker">
      {list.length ? (
        <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 10, maxHeight: "52vh", overflowY: "auto", padding: 4 }}>
          {list.map((w) => (
            <button
              key={w.id}
              className={`tile${chosen.has(w.id) ? " selected" : ""}`}
              onClick={() => {
                const n = new Set(chosen);
                if (n.has(w.id)) n.delete(w.id);
                else n.add(w.id);
                setChosen(n);
              }}
              aria-pressed={chosen.has(w.id)}
              aria-label={w.title}
              data-testid={`pick-${w.title}`}
            >
              <img src={thumb(w.id)} alt="" />
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">Everything in your library is already in this playlist.</p>
      )}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
        <button className="btn ghost" onClick={() => setChosen(new Set(list.map((w) => w.id)))}>
          Select all
        </button>
        <button
          className="btn primary"
          disabled={!chosen.size}
          onClick={() => {
            onClose();
            void run(api.addToPlaylist(playlist.id, [...chosen]), `Added ${plural(chosen.size, "wallpaper")}`);
          }}
          data-testid="picker-add"
        >
          Add {chosen.size || ""}
        </button>
      </div>
    </Modal>
  );
}

export function RulesEditor({ initial, onSave, saveLabel = "Save rules" }: { initial: SmartRules; onSave: (r: SmartRules) => void; saveLabel?: string }) {
  const snap = useStore((s) => s.snap)!;
  const [r, setR] = useState<SmartRules>(initial);
  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const SOURCES: { value: Source; label: string }[] = [
    { value: "folder", label: "Folders" },
    { value: "import", label: "Added" },
    { value: "wallhaven", label: "Wallhaven" },
    { value: "bing", label: "Bing" },
  ];
  return (
    <div className="stack" style={{ gap: 18 }}>
      <Toggle label="Favourites only" value={r.favouritesOnly} onChange={(v) => setR({ ...r, favouritesOnly: v })} testId="rule-favourites" />
      <Field label="Brightness">
        <Seg<Tone>
          value={r.tone}
          onChange={(tone) => setR({ ...r, tone })}
          testId="rule-tone"
          options={[
            { value: "any", label: "Any" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </Field>
      <Field label="Colours (any of)">
        <div className="row wrap" style={{ gap: 6 }}>
          {HUES.map((h) => (
            <button key={h.hue} className={`chip${r.hues.includes(h.hue) ? " on" : ""}`} onClick={() => setR({ ...r, hues: toggleIn(r.hues, h.hue) })} data-testid={`rule-hue-${h.hue}`}>
              <span className="dot" style={{ background: h.swatch }} /> {h.label}
            </button>
          ))}
        </div>
      </Field>
      {snap.collections.length ? (
        <Field label="From collections (any of)">
          <div className="row wrap" style={{ gap: 6 }}>
            {snap.collections.map((c) => (
              <button key={c.id} className={`chip${r.collections.includes(c.id) ? " on" : ""}`} onClick={() => setR({ ...r, collections: toggleIn(r.collections, c.id) })}>
                {c.name}
              </button>
            ))}
          </div>
        </Field>
      ) : null}
      <Field label="From">
        <div className="row wrap" style={{ gap: 6 }}>
          {SOURCES.map((s) => (
            <button key={s.value} className={`chip${r.sources.includes(s.value) ? " on" : ""}`} onClick={() => setR({ ...r, sources: toggleIn(r.sources, s.value) })}>
              {s.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="At least this wide">
        <select className="input" value={r.minWidth} onChange={(e) => setR({ ...r, minWidth: Number(e.target.value) })}>
          <option value={0}>Any size</option>
          <option value={1920}>1920 px (Full HD)</option>
          <option value={2560}>2560 px (QHD)</option>
          <option value={3840}>3840 px (4K)</option>
        </select>
      </Field>
      <p className="small" style={{ margin: 0 }} data-testid="rules-summary">
        {describeRules(r, (id) => snap.collections.find((c) => c.id === id)?.name ?? "?")} · {snap.wallpapers.filter((w) => matchesNow(w, r, snap.membership)).length} right now
      </p>
      <button className="btn primary" onClick={() => onSave(r)} data-testid="rules-save">
        {saveLabel}
      </button>
    </div>
  );
}

function matchesNow(w: Parameters<typeof matches>[0], r: SmartRules, membership: Record<string, string[]>) {
  return matches(w, r, (id) => new Set(membership[id] ?? []));
}

export function NewPlaylist({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"normal" | "smart">("normal");
  const create = async (smart: SmartRules | null) => {
    onClose();
    const id = await run(api.createPlaylist({ name: name || (smart ? "Smart mix" : "New playlist"), smart, items: [] }));
    if (id) go({ name: "playlist", id });
  };
  return (
    <Modal title="New playlist" onClose={onClose} testId="new-playlist-dialog">
      <div className="stack" style={{ gap: 16 }}>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mornings, Neon nights, Calm…" autoFocus data-testid="playlist-name" />
        </Field>
        <Seg
          value={kind}
          onChange={setKind}
          testId="playlist-kind"
          options={[
            { value: "normal", label: "Pick wallpapers" },
            { value: "smart", label: "Smart: fill by rules" },
          ]}
        />
        {kind === "normal" ? (
          <button className="btn primary" onClick={() => void create(null)} data-testid="create-playlist">
            Create playlist
          </button>
        ) : (
          <RulesEditor initial={EMPTY_RULES} onSave={(r) => void create(r)} saveLabel="Create smart playlist" />
        )}
      </div>
    </Modal>
  );
}
