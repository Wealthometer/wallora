import { useState } from "react";
import { Copy, FolderPlus, Heart, ImagePlus, Images, ListMusic, Pencil, Play, Search, Trash2, X, Layers } from "lucide-react";
import { HUES } from "../../shared/color.ts";
import { EMPTY_RULES, duplicates, matches, search, sortWallpapers, type SortKey } from "../../shared/smart.ts";
import type { Hue, Tone, Wallpaper } from "../../shared/types.ts";
import { api, getState, go, openDetail, run, setSelected, useStore } from "../store.ts";
import { addPictures, ask, wallpaperMenu } from "../ui/actions.tsx";
import { Empty, Menu, Modal, plural, Seg, Tile, type MenuItem } from "../ui/kit.tsx";

const PAGE = 240;

export function LibraryView({ filter, collectionId }: { filter?: "favourites" | "duplicates" | "missing"; collectionId?: string }) {
  const snap = useStore((s) => s.snap)!;
  const selected = useStore((s) => s.selected);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("added");
  const [hues, setHues] = useState<Hue[]>([]);
  const [tone, setTone] = useState<Tone>("any");
  const [limit, setLimit] = useState(PAGE);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuItem[] } | null>(null);
  const [renaming, setRenaming] = useState(false);

  const collection = collectionId ? snap.collections.find((c) => c.id === collectionId) : undefined;
  if (collectionId && !collection) return <Empty icon={Layers} title="This collection is gone" />;
  const inColl = collection ? new Set(Object.entries(snap.membership).filter(([, cs]) => cs.includes(collection.id)).map(([w]) => w)) : null;

  let list = snap.wallpapers;
  if (inColl) list = list.filter((w) => inColl.has(w.id));
  if (filter === "favourites") list = list.filter((w) => w.favourite);
  if (filter === "missing") list = list.filter((w) => w.missing);
  const rules = { ...EMPTY_RULES, hues, tone };
  list = list.filter((w) => matches({ ...w, missing: false }, rules, () => new Set()));
  list = sortWallpapers(search(list, q), sort);
  const dupGroups = filter === "duplicates" ? duplicates(snap.wallpapers) : null;
  const shown = dupGroups ? dupGroups.flat() : list;

  const missingCount = snap.wallpapers.filter((w) => w.missing).length;
  const dupCount = duplicates(snap.wallpapers).length;

  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  };
  const ids = [...selected];

  const title = collection ? collection.name : filter === "favourites" ? "Favourites" : filter === "duplicates" ? "Duplicates" : filter === "missing" ? "Missing files" : "Library";
  const eyebrow = collection ? "Collection" : filter ? "Library" : "Everything";

  const contextFor = (w: Wallpaper, e: React.MouseEvent) => {
    e.preventDefault();
    const target = selected.has(w.id) ? ids : [w.id];
    const items = wallpaperMenu(target);
    if (collection) items.splice(items.length - 1, 0, { label: `Take out of ${collection.name}`, icon: X, testId: "menu-uncollect", onClick: () => void run(api.removeFromCollection(collection.id, target)) });
    setMenu({ at: { x: e.clientX, y: e.clientY }, items });
  };

  return (
    <div className={selected.size ? "selecting" : ""}>
      <div className="page-head">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1 className="title">{title}</h1>
          <p className="subtitle" data-testid="library-count">
            {plural(shown.length, "wallpaper")}
            {collection ? "" : filter ? "" : ` · ${plural(snap.folders.length, "watched folder")}`}
          </p>
        </div>
        <div className="row">
          {collection ? (
            <>
              <button className="btn primary" onClick={() => void playCollection(collection.id, collection.name)} data-testid="play-collection" disabled={!collection.count}>
                <Play size={16} fill="currentColor" /> Play
              </button>
              <button className="btn icon" aria-label="Rename collection" onClick={() => setRenaming(true)}>
                <Pencil size={16} />
              </button>
              <button
                className="btn icon danger"
                aria-label="Delete collection"
                data-testid="delete-collection"
                onClick={() => {
                  go({ name: "library" });
                  void run(api.deleteCollection(collection.id), `Deleted “${collection.name}”. The wallpapers are still in your library.`);
                }}
              >
                <Trash2 size={16} />
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => void run(api.addFolder())} data-testid="add-folder">
                <FolderPlus size={16} /> Watch folder
              </button>
              <button className="btn primary" onClick={() => void addPictures()} data-testid="add-pictures">
                <ImagePlus size={16} /> Add pictures
              </button>
            </>
          )}
        </div>
      </div>

      {!dupGroups ? (
        <div className="row wrap" style={{ marginBottom: 20, gap: 12 }}>
          <div className="search">
            <Search size={16} />
            <input className="input" placeholder="Search names, colours, folders…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="search" aria-label="Search" />
          </div>
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort" data-testid="sort">
            <option value="added">Newest first</option>
            <option value="shown">Recently shown</option>
            <option value="name">Name</option>
            <option value="color">Colour</option>
            <option value="brightness">Brightest first</option>
          </select>
          <Seg<Tone>
            value={tone}
            onChange={setTone}
            testId="tone"
            options={[
              { value: "any", label: "All" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
          <div className="row" style={{ gap: 5 }} role="group" aria-label="Colours">
            {HUES.map((h) => (
              <button
                key={h.hue}
                className={`chip${hues.includes(h.hue) ? " on" : ""}`}
                style={{ padding: "0 8px" }}
                aria-label={h.label}
                aria-pressed={hues.includes(h.hue)}
                title={h.label}
                data-testid={`hue-${h.hue}`}
                onClick={() => setHues(hues.includes(h.hue) ? hues.filter((x) => x !== h.hue) : [...hues, h.hue])}
              >
                <span className="dot" style={{ background: h.swatch }} />
              </button>
            ))}
          </div>
          {!collection && !filter && (dupCount || missingCount) ? (
            <div className="row" style={{ marginLeft: "auto" }}>
              {dupCount ? (
                <button className="chip" onClick={() => go({ name: "library", filter: "duplicates" })} data-testid="show-duplicates">
                  <Copy size={13} /> {plural(dupCount, "duplicate")}
                </button>
              ) : null}
              {missingCount ? (
                <button className="chip" onClick={() => go({ name: "library", filter: "missing" })}>
                  {missingCount} missing
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="muted" style={{ marginTop: -8 }}>
          The same picture saved more than once. Select the copies you don't need and remove them; the oldest of each is listed first.
        </p>
      )}

      {selected.size ? (
        <div className="selbar" data-testid="selbar">
          <b className="grow">{plural(selected.size, "selected", "selected")}</b>
          <button className="btn small" onClick={() => void run(api.favourite(ids, true))} data-testid="sel-favourite">
            <Heart size={14} /> Favourite
          </button>
          <button className="btn small" onClick={() => ask({ kind: "collection", ids })} data-testid="sel-collection">
            <Layers size={14} /> Collection
          </button>
          <button className="btn small" onClick={() => ask({ kind: "playlist", ids })} data-testid="sel-playlist">
            <ListMusic size={14} /> Playlist
          </button>
          <button className="btn small danger" onClick={() => ask({ kind: "remove", ids })} data-testid="sel-remove">
            <Trash2 size={14} /> Remove
          </button>
          <button className="btn small ghost" onClick={() => setSelected(new Set(shown.map((w) => w.id)))}>
            All
          </button>
          <button className="btn icon small ghost" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
            <X size={15} />
          </button>
        </div>
      ) : null}

      {shown.length ? (
        <div className="grid" data-testid="grid">
          {shown.slice(0, limit).map((w, i) => (
            <Tile key={w.id} w={w} delay={i} selected={selected.has(w.id)} onToggle={() => toggle(w.id)} onClick={() => (selected.size ? toggle(w.id) : openDetail(w.id))} onContextMenu={(e) => contextFor(w, e)} />
          ))}
        </div>
      ) : (
        <Empty icon={filter === "favourites" ? Heart : Images} title={q || hues.length || tone !== "any" ? "Nothing matches" : filter === "favourites" ? "No favourites yet" : collection ? "This collection is empty" : filter === "duplicates" ? "No duplicates" : "No wallpapers yet"}>
          <p style={{ maxWidth: 380, margin: 0 }}>
            {q || hues.length || tone !== "any"
              ? "Try fewer filters."
              : filter === "favourites"
                ? "Press the heart on a wallpaper you love. Favourites can have their own smart playlist."
                : collection
                  ? "Right-click wallpapers in the library and choose “Add to collection”."
                  : filter === "duplicates"
                    ? "Every picture in your library is unique."
                    : "Watch a folder, add pictures, or find some in Discover."}
          </p>
        </Empty>
      )}
      {shown.length > limit ? (
        <div className="row" style={{ justifyContent: "center", marginTop: 24 }}>
          <button className="btn" onClick={() => setLimit(limit + PAGE)}>
            Show more ({shown.length - limit} left)
          </button>
        </div>
      ) : null}

      {menu ? <Menu at={menu.at} items={menu.items} onClose={() => setMenu(null)} /> : null}
      {renaming && collection ? <RenameCollection id={collection.id} name={collection.name} onClose={() => setRenaming(false)} /> : null}
    </div>
  );
}

/** Plays a collection through a smart playlist made for it (reused if it exists). */
async function playCollection(id: string, name: string) {
  const existing = getState().snap!.playlists.find((p) => p.smart && p.smart.collections.length === 1 && p.smart.collections[0] === id);
  const pid = existing?.id ?? (await run(api.createPlaylist({ name, smart: { ...EMPTY_RULES, collections: [id] }, items: [] })));
  if (pid) await run(api.play(pid), `Playing ${name}`);
}

function RenameCollection({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const [v, setV] = useState(name);
  const save = () => {
    onClose();
    void run(api.renameCollection(id, v));
  };
  return (
    <Modal title="Rename collection" onClose={onClose}>
      <div className="stack">
        <input className="input" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} autoFocus />
        <button className="btn primary" onClick={save}>
          Save
        </button>
      </div>
    </Modal>
  );
}
