import { FolderOpen, FolderPlus, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { api, run, useStore } from "../store.ts";
import { agoText, Empty, plural, useClock } from "../ui/kit.tsx";

export function FoldersView() {
  const snap = useStore((s) => s.snap)!;
  const progress = useStore((s) => s.progress);
  const now = useClock(30_000);
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Folders</div>
          <h1 className="title">
            Watched <em>folders</em>
          </h1>
          <p className="subtitle">Pictures you put in these folders join the library by themselves. JPEG, PNG and BMP, including subfolders.</p>
        </div>
        <div className="row">
          {snap.folders.length ? (
            <button className="btn" onClick={() => void run(api.rescan(null))} data-testid="rescan-all">
              <RefreshCw size={16} /> Rescan all
            </button>
          ) : null}
          <button className="btn primary" onClick={() => void run(api.addFolder())} data-testid="watch-folder">
            <FolderPlus size={16} /> Watch a folder
          </button>
        </div>
      </div>
      {snap.folders.length ? (
        <div className="stack" style={{ gap: 10 }}>
          {snap.folders.map((f) => {
            const p = progress[f.id];
            return (
              <div key={f.id} className="card row" style={{ padding: "14px 18px", gap: 16 }} data-testid={`folder-${f.path.split(/[\\/]/).pop()}`}>
                <div className="empty" style={{ padding: 0 }}>
                  <div className="orb" style={{ width: 48, height: 48, borderRadius: 16, animation: "none" }}>
                    <FolderOpen size={22} />
                  </div>
                </div>
                <div className="grow">
                  <div className="h3" style={{ wordBreak: "break-all" }}>
                    {f.path}
                  </div>
                  {p ? (
                    <div style={{ marginTop: 8 }}>
                      <div className="bar">
                        <i style={{ width: `${Math.round((p.done / Math.max(1, p.total)) * 100)}%` }} />
                      </div>
                      <div className="small" style={{ marginTop: 4 }}>
                        Reading {p.done} of {p.total}…
                      </div>
                    </div>
                  ) : f.error ? (
                    <div className="small" style={{ color: "var(--danger)" }}>
                      <TriangleAlert size={12} style={{ verticalAlign: -1 }} /> {f.error}
                    </div>
                  ) : (
                    <div className="small" data-testid="folder-count">
                      {plural(f.count, "wallpaper")}
                      {f.lastScan ? ` · checked ${agoText(f.lastScan, now)}` : ""}
                      {f.recursive ? " · includes subfolders" : ""}
                    </div>
                  )}
                </div>
                <button className="btn small" onClick={() => void run(api.rescan(f.id))}>
                  <RefreshCw size={14} /> Rescan
                </button>
                <button className="btn icon small danger" aria-label={`Stop watching ${f.path}`} onClick={() => void run(api.removeFolder(f.id), "Stopped watching. The files are still on your disk.")} data-testid="remove-folder">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty icon={FolderOpen} title="No folders yet">
          <p style={{ margin: 0, maxWidth: 420 }}>Pick your Pictures folder, a wallpapers folder, or a synced folder from OneDrive or Dropbox. Wallora only reads; it never moves or changes your files.</p>
          <button className="btn primary" onClick={() => void run(api.addFolder())}>
            <FolderPlus size={16} /> Watch a folder
          </button>
        </Empty>
      )}
    </div>
  );
}
