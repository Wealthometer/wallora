import { useEffect, useState } from "react";
import { Copy, FolderOpen, Heart, HeartOff, ListMusic, Monitor, MonitorPlay, Pencil, Plus, Trash2, FolderPlus, ExternalLink } from "lucide-react";
import type { Wallpaper } from "../../shared/types.ts";
import { api, getState, run, toast } from "../store.ts";
import { Field, Modal, plural, type MenuItem } from "./kit.tsx";

/** The actions on one or more wallpapers, used by the context menu, the drawer and the selection bar. */

type Ask = { kind: "collection" | "playlist"; ids: string[] } | { kind: "rename"; w: Wallpaper } | { kind: "remove"; ids: string[] } | null;

let openAsk: (a: Ask) => void = () => undefined;

export function ask(a: Ask) {
  openAsk(a);
}

/** "Add pictures": pick files, copy them in, and say what happened. */
export async function addPictures() {
  const r = await run(api.importFiles());
  if (r) {
    const parts = [r.added ? `Added ${plural(r.added, "wallpaper")}` : "", r.skipped ? `${r.skipped} already in your library` : "", r.failed ? `${r.failed} couldn't be read` : ""].filter(Boolean);
    if (parts.length) toast(parts.join(" · "), r.failed && !r.added ? "error" : "ok");
  }
}

export function wallpaperMenu(ids: string[]): MenuItem[] {
  const snap = getState().snap!;
  const list = ids.map((id) => getState().byId.get(id)).filter((w): w is Wallpaper => !!w);
  const one = list.length === 1 ? list[0]! : null;
  const allFav = list.every((w) => w.favourite);
  const items: MenuItem[] = [];
  if (one && !one.missing) {
    items.push({ label: "Set as wallpaper", icon: MonitorPlay, testId: "menu-set", onClick: () => void run(api.show(one.id, null)) });
    if (snap.displays.length > 1 && snap.desktop.perDisplay) {
      for (const d of snap.displays) items.push({ label: `Set on ${d.label}`, icon: Monitor, onClick: () => void run(api.show(one.id, d.id)) });
    }
    items.push("sep");
  }
  items.push({
    label: allFav ? "Remove from favourites" : "Add to favourites",
    icon: allFav ? HeartOff : Heart,
    testId: "menu-favourite",
    onClick: () => void run(api.favourite(ids, !allFav)),
  });
  items.push({ label: "Add to collection…", icon: FolderPlus, testId: "menu-collection", onClick: () => ask({ kind: "collection", ids }) });
  items.push({ label: "Add to playlist…", icon: ListMusic, testId: "menu-playlist", onClick: () => ask({ kind: "playlist", ids }) });
  if (one) {
    items.push("sep");
    items.push({ label: "Rename", icon: Pencil, testId: "menu-rename", onClick: () => ask({ kind: "rename", w: one }) });
    items.push({ label: "Show in folder", icon: FolderOpen, onClick: () => void api.reveal(one.id) });
    if (one.sourceUrl) items.push({ label: "Open the original page", icon: ExternalLink, onClick: () => void api.openSource(one.id) });
    items.push({ label: "Copy colours", icon: Copy, onClick: () => void navigator.clipboard.writeText(one.colors.join(" ")).then(() => toast("Colours copied")) });
  }
  items.push("sep");
  items.push({ label: list.length > 1 ? `Remove ${list.length} wallpapers…` : "Remove…", icon: Trash2, danger: true, testId: "menu-remove", onClick: () => ask({ kind: "remove", ids }) });
  return items;
}

export function Asks() {
  const [a, setA] = useState<Ask>(null);
  useEffect(() => {
    openAsk = setA;
  }, []);
  if (!a) return null;
  const close = () => setA(null);
  if (a.kind === "collection" || a.kind === "playlist") return <AddTo kind={a.kind} ids={a.ids} onClose={close} />;
  if (a.kind === "rename") return <Rename w={a.w} onClose={close} />;
  return <Remove ids={a.ids} onClose={close} />;
}

function AddTo({ kind, ids, onClose }: { kind: "collection" | "playlist"; ids: string[]; onClose: () => void }) {
  const snap = getState().snap!;
  const [name, setName] = useState("");
  const lists = kind === "collection" ? snap.collections.map((c) => ({ id: c.id, name: c.name, n: c.count })) : snap.playlists.filter((p) => !p.smart).map((p) => ({ id: p.id, name: p.name, n: p.items.length }));
  const what = ids.length === 1 ? "1 wallpaper" : `${ids.length} wallpapers`;
  const add = async (id: string, label: string) => {
    onClose();
    await run(kind === "collection" ? api.addToCollection(id, ids) : api.addToPlaylist(id, ids), `Added ${what} to ${label}`);
  };
  const create = async () => {
    if (!name.trim()) return;
    onClose();
    if (kind === "collection") await run(api.createCollection(name, ids), `Made “${name.trim()}” with ${what}`);
    else await run(api.createPlaylist({ name, smart: null, items: ids }), `Made “${name.trim()}” with ${what}`);
  };
  return (
    <Modal title={kind === "collection" ? "Add to collection" : "Add to playlist"} onClose={onClose} testId="add-to">
      <div className="stack">
        {lists.map((l) => (
          <button key={l.id} className="btn" style={{ justifyContent: "space-between" }} onClick={() => void add(l.id, l.name)} data-testid={`add-to-${l.name}`}>
            <span>{l.name}</span>
            <span className="small">{l.n}</span>
          </button>
        ))}
        {lists.length ? <div className="divider" /> : null}
        <Field label={kind === "collection" ? "New collection" : "New playlist"}>
          <div className="row">
            <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void create()} placeholder={kind === "collection" ? "Beaches, Studio Ghibli, Minimal…" : "Mornings, Rainy days…"} autoFocus data-testid="new-list-name" />
            <button className="btn primary" onClick={() => void create()} disabled={!name.trim()} data-testid="new-list-create">
              <Plus size={16} /> Create
            </button>
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function Rename({ w, onClose }: { w: Wallpaper; onClose: () => void }) {
  const [title, setTitle] = useState(w.title);
  const save = () => {
    onClose();
    void run(api.rename(w.id, title));
  };
  return (
    <Modal title="Rename" onClose={onClose}>
      <div className="stack">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} autoFocus data-testid="rename-input" />
        <button className="btn primary" onClick={save} data-testid="rename-save">
          Save
        </button>
      </div>
    </Modal>
  );
}

function Remove({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const what = ids.length === 1 ? "this wallpaper" : `${ids.length} wallpapers`;
  const go = async (files: boolean) => {
    onClose();
    const r = await run(api.removeWallpapers(ids, files));
    if (r) toast(files ? `Moved ${r.trashed} file${r.trashed === 1 ? "" : "s"} to the bin` : `Removed ${r.removed} from the library`);
  };
  return (
    <Modal title={`Remove ${what}?`} onClose={onClose} testId="remove-dialog">
      <p className="muted" style={{ marginTop: 0 }}>
        Removing takes it out of Wallora, its collections and playlists. Pictures in a watched folder come back if you rescan, unless you also move the file to the bin.
      </p>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn danger" onClick={() => void go(true)} data-testid="remove-trash">
          Remove and move file to bin
        </button>
        <button className="btn primary" onClick={() => void go(false)} data-testid="remove-library">
          Remove from Wallora
        </button>
      </div>
    </Modal>
  );
}
