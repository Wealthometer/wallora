import { useSyncExternalStore } from "react";
import type { Bridge, Notice, Progress, Snapshot } from "../shared/api.ts";
import type { Wallpaper } from "../shared/types.ts";

declare global {
  interface Window {
    wallora: Bridge;
  }
}

export const api: Bridge = window.wallora;

export type View =
  | { name: "now" }
  | { name: "library"; filter?: "favourites" | "duplicates" | "missing" }
  | { name: "collection"; id: string }
  | { name: "playlist"; id: string }
  | { name: "schedule" }
  | { name: "discover" }
  | { name: "folders" }
  | { name: "history" }
  | { name: "displays" }
  | { name: "settings" };

type Toast = Notice & { id: number };

type State = {
  snap: Snapshot | null;
  byId: Map<string, Wallpaper>;
  view: View;
  detail: string | null;
  toasts: Toast[];
  progress: Record<string, Progress>;
  /** Library selection, shared by the grid and the action bar. */
  selected: Set<string>;
};

let state: State = { snap: null, byId: new Map(), view: { name: "now" }, detail: null, toasts: [], progress: {}, selected: new Set() };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => sel(state),
  );
}

export function getState(): State {
  return state;
}

function applySnapshot(part: Partial<Snapshot>) {
  const snap = { ...(state.snap ?? ({} as Snapshot)), ...part } as Snapshot;
  set({ snap, byId: part.wallpapers ? new Map(part.wallpapers.map((w) => [w.id, w])) : state.byId });
}

let toastSeq = 0;
export function toast(message: string, tone: Notice["tone"] = "ok") {
  const id = ++toastSeq;
  set({ toasts: [...state.toasts.slice(-3), { id, tone, message }] });
  setTimeout(() => set({ toasts: state.toasts.filter((t) => t.id !== id) }), tone === "error" ? 6000 : 3200);
}

export async function boot() {
  api.on("snapshot", applySnapshot);
  api.on("notice", (n) => toast(n.message, n.tone));
  api.on("progress", (p) => {
    const progress = { ...state.progress, [p.id]: p };
    if (p.finished) delete progress[p.id];
    set({ progress });
    if (p.finished && p.error) toast(p.error, "error");
  });
  applySnapshot(await api.snapshot());
}

export function go(view: View) {
  set({ view, selected: new Set() });
}

export function openDetail(id: string | null) {
  set({ detail: id });
}

export function setSelected(selected: Set<string>) {
  set({ selected });
}

/** Runs an API call, showing its error message as a toast. */
export async function run<T>(p: Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const r = await p;
    if (success) toast(success);
    return r;
  } catch (e) {
    toast(cleanError(e), "error");
    return undefined;
  }
}

export function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // "Error invoking remote method 'wallora': Error: <message>"
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

export const thumb = (id: string) => `wallora-img://thumb/${id}`;
export const full = (id: string) => `wallora-img://full/${id}`;
