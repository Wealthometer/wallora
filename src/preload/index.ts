import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { API_METHODS, type Bridge } from "../shared/api.ts";

/** Exposes a typed, minimal API on window.wallora. The window never sees Node or Electron directly. */
const bridge: Record<string, unknown> = {};
for (const m of API_METHODS) bridge[m] = (...args: unknown[]) => ipcRenderer.invoke("wallora", m, args);

bridge.on = (event: "snapshot" | "progress" | "notice" | "overlay" | "stats", cb: (payload: unknown) => void) => {
  const channel = `wallora:${event}`;
  const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("wallora", bridge as Bridge);
