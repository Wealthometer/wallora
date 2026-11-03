import { History as HistoryIcon, Play, Trash2 } from "lucide-react";
import { api, openDetail, run, thumb, useStore } from "../store.ts";
import { Empty } from "../ui/kit.tsx";

export function HistoryView() {
  const snap = useStore((s) => s.snap)!;
  const byId = useStore((s) => s.byId);
  const multi = snap.displays.length > 1;
  const label = (id: string) => snap.displays.find((d) => d.id === id)?.label ?? "A display that's not connected";

  // Group by day.
  const groups: { day: string; items: typeof snap.history }[] = [];
  for (const h of snap.history) {
    const d = new Date(h.at);
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const day = d.toDateString() === today.toDateString() ? "Today" : d.toDateString() === yesterday.toDateString() ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(h);
    else groups.push({ day, items: [h] });
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">History</div>
          <h1 className="title">
            What's been <em>on</em>
          </h1>
          <p className="subtitle">The last 1,000 changes. Double-click one to bring it back.</p>
        </div>
        {snap.history.length ? (
          <button className="btn" onClick={() => void run(api.clearHistory(), "History cleared")}>
            <Trash2 size={16} /> Clear
          </button>
        ) : null}
      </div>
      {groups.length ? (
        groups.map((g) => (
          <div key={g.day} className="section" style={{ marginTop: 24 }}>
            <h2 className="h3 muted" style={{ marginBottom: 10 }}>
              {g.day}
            </h2>
            <div className="tracks" data-testid="history-list">
              {g.items.map((h) => {
                const w = byId.get(h.wallpaperId);
                if (!w) return null;
                const pl = h.playlistId ? snap.playlists.find((p) => p.id === h.playlistId)?.name : null;
                return (
                  <div key={h.id} className="track" style={{ gridTemplateColumns: "64px 88px 1fr auto" }} onDoubleClick={() => void run(api.show(w.id, multi ? h.displayId : null))}>
                    <span className="n small">{new Date(h.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                    <img src={thumb(w.id)} alt="" />
                    <div style={{ minWidth: 0 }}>
                      <div className="h3" style={{ cursor: "pointer" }} onClick={() => openDetail(w.id)}>
                        {w.title}
                      </div>
                      <div className="small">{[pl ? `from ${pl}` : "from your library", multi ? label(h.displayId) : ""].filter(Boolean).join(" · ")}</div>
                    </div>
                    <button className="btn icon small ghost" aria-label={`Show ${w.title} again`} onClick={() => void run(api.show(w.id, multi ? h.displayId : null))}>
                      <Play size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      ) : (
        <Empty icon={HistoryIcon} title="Nothing yet">
          <p style={{ margin: 0 }}>Every wallpaper change will be listed here.</p>
        </Empty>
      )}
    </div>
  );
}
