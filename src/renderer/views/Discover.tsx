import { useCallback, useEffect, useState } from "react";
import { Check, Download, ExternalLink, Loader2, MonitorPlay, RefreshCw, Search, WifiOff } from "lucide-react";
import { DEFAULT_WALLHAVEN, WALLHAVEN_COLORS, type WallhavenQuery } from "../../shared/sources.ts";
import type { OnlinePage, OnlineResult } from "../../shared/types.ts";
import { api, cleanError, run, toast, useStore } from "../store.ts";
import { Empty, Seg } from "../ui/kit.tsx";

export function DiscoverView() {
  const [tab, setTab] = useState<"wallhaven" | "bing">("wallhaven");
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Discover</div>
          <h1 className="title">
            Find something <em>new</em>
          </h1>
          <p className="subtitle">Downloads go to your Pictures folder and straight into the library. Safe-for-work images only.</p>
        </div>
        <Seg
          value={tab}
          onChange={setTab}
          testId="discover-tab"
          options={[
            { value: "wallhaven", label: "Wallhaven" },
            { value: "bing", label: "Bing daily" },
          ]}
        />
      </div>
      {tab === "wallhaven" ? <Wallhaven /> : <Bing />}
    </div>
  );
}

function useDownloader() {
  const [got, setGot] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const progress = useStore((s) => s.progress);
  const download = async (r: OnlineResult) => {
    const key = `${r.source}:${r.sourceId}`;
    setBusy((b) => new Set(b).add(key));
    try {
      const id = await api.download(r);
      setGot((g) => ({ ...g, [key]: id }));
      toast(`Downloaded ${r.title}`);
    } catch (e) {
      toast(cleanError(e), "error");
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(key);
        return n;
      });
    }
  };
  return { got, busy, progress, download };
}

function ResultCard({ r, d }: { r: OnlineResult; d: ReturnType<typeof useDownloader> }) {
  const key = `${r.source}:${r.sourceId}`;
  const id = d.got[key];
  const have = r.have || !!id;
  const p = d.progress[key];
  const loading = d.busy.has(key);
  return (
    <div className="tile" style={{ aspectRatio: "16 / 10" }} data-testid={`result-${r.sourceId}`}>
      <img src={r.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
      <div className="badges">
        <span className="badge">{r.width >= 3840 ? "4K" : `${r.width}×${r.height}`}</span>
        {have ? (
          <span className="badge accent">
            <Check size={12} /> In library
          </span>
        ) : null}
      </div>
      <div className="shade" style={{ opacity: 1 }}>
        <span className="name">{r.credit ?? r.title}</span>
        <button className="btn icon small" style={{ background: "rgba(0,0,0,.45)" }} aria-label="Open the original page" onClick={() => window.open(r.pageUrl, "_blank")}>
          <ExternalLink size={14} />
        </button>
        {id ? (
          <button className="btn small primary" onClick={() => void run(api.show(id, null), "Wallpaper set")} data-testid={`set-${r.sourceId}`}>
            <MonitorPlay size={14} /> Set
          </button>
        ) : (
          <button className="btn small primary" disabled={have || loading} onClick={() => void d.download(r)} data-testid={`download-${r.sourceId}`}>
            {loading ? <Loader2 size={14} className="spin" /> : <Download size={14} />} {loading && p ? `${Math.round((p.done / Math.max(1, p.total)) * 100)}%` : have ? "Saved" : "Get"}
          </button>
        )}
      </div>
    </div>
  );
}

function Wallhaven() {
  const [q, setQ] = useState<WallhavenQuery>(DEFAULT_WALLHAVEN);
  const [text, setText] = useState("");
  const [page, setPage] = useState<OnlinePage | null>(null);
  const [results, setResults] = useState<OnlineResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const d = useDownloader();

  const load = useCallback(async (query: WallhavenQuery, append: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const p = await api.wallhaven(query);
      setPage(p);
      setResults((r) => (append ? [...r, ...p.results] : p.results));
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q, q.page > 1), 0);
    return () => clearTimeout(t);
  }, [q, load]);

  const set = (patch: Partial<WallhavenQuery>) => setQ({ ...q, ...patch, page: 1, seed: null });

  return (
    <>
      <div className="row wrap" style={{ gap: 12, marginBottom: 14 }}>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: text, sorting: text && q.sorting === "toplist" ? "relevance" : q.sorting });
          }}
        >
          <Search size={16} />
          <input className="input" placeholder="Mountains, cyberpunk, minimal…" value={text} onChange={(e) => setText(e.target.value)} data-testid="wh-search" aria-label="Search Wallhaven" />
        </form>
        <Seg
          value={q.sorting === "relevance" ? "toplist" : q.sorting}
          onChange={(sorting) => set({ sorting })}
          testId="wh-sort"
          options={[
            { value: "toplist", label: "Top" },
            { value: "date_added", label: "Latest" },
            { value: "random", label: "Random" },
            { value: "favorites", label: "Most loved" },
          ]}
        />
        {q.sorting === "toplist" ? (
          <select className="input" value={q.topRange} onChange={(e) => set({ topRange: e.target.value as WallhavenQuery["topRange"] })} aria-label="Top of">
            <option value="1M">This month</option>
            <option value="3M">3 months</option>
            <option value="6M">6 months</option>
            <option value="1y">This year</option>
          </select>
        ) : null}
        <select className="input" value={q.ratios} onChange={(e) => set({ ratios: e.target.value as WallhavenQuery["ratios"] })} aria-label="Shape">
          <option value="landscape">Landscape</option>
          <option value="16x9">16:9</option>
          <option value="21x9">Ultrawide 21:9</option>
          <option value="32x9">Super-ultrawide 32:9</option>
          <option value="portrait">Portrait</option>
          <option value="any">Any shape</option>
        </select>
        <select className="input" value={q.atleast ?? ""} onChange={(e) => set({ atleast: e.target.value || null })} aria-label="At least">
          <option value="">Any size</option>
          <option value="1920x1080">Full HD+</option>
          <option value="2560x1440">QHD+</option>
          <option value="3840x2160">4K+</option>
        </select>
        {q.sorting === "random" ? (
          <button className="btn icon" aria-label="Shuffle again" onClick={() => setQ({ ...q, page: 1, seed: null })}>
            <RefreshCw size={16} />
          </button>
        ) : null}
      </div>
      <div className="colors" style={{ marginBottom: 22 }} role="group" aria-label="Colour">
        {WALLHAVEN_COLORS.map((c) => (
          <button key={c} className={q.color === c ? "on" : ""} style={{ background: `#${c}` }} aria-label={`#${c}`} aria-pressed={q.color === c} onClick={() => set({ color: q.color === c ? null : c })} />
        ))}
      </div>

      {error ? (
        <Empty icon={WifiOff} title="Couldn't load wallpapers">
          <p style={{ margin: 0 }}>{error}</p>
          <button className="btn" onClick={() => void load(q, false)}>
            Try again
          </button>
        </Empty>
      ) : results.length ? (
        <>
          <div className="grid" data-testid="wh-results">
            {results.map((r) => (
              <ResultCard key={r.sourceId} r={r} d={d} />
            ))}
          </div>
          {page && page.page < page.lastPage ? (
            <div className="row" style={{ justifyContent: "center", marginTop: 24 }}>
              <button className="btn" disabled={loading} onClick={() => setQ({ ...q, page: page.page + 1, seed: page.seed })} data-testid="wh-more">
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      ) : loading ? (
        <div className="grid">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="tile" style={{ animationDelay: `${i * 40}ms` }} />
          ))}
        </div>
      ) : (
        <Empty icon={Search} title="Nothing found">
          <p style={{ margin: 0 }}>Try another word or fewer filters.</p>
        </Empty>
      )}
    </>
  );
}

function Bing() {
  const [page, setPage] = useState<OnlinePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const d = useDownloader();
  useEffect(() => {
    let live = true;
    api
      .bing()
      .then((p) => live && setPage(p))
      .catch((e) => live && setError(cleanError(e)));
    return () => {
      live = false;
    };
  }, []);
  if (error)
    return (
      <Empty icon={WifiOff} title="Couldn't reach Bing">
        <p style={{ margin: 0 }}>{error}</p>
      </Empty>
    );
  if (!page) return <p className="muted">Loading the last eight days…</p>;
  return (
    <>
      <p className="muted" style={{ marginTop: -6 }}>Bing's homepage photo for each of the last eight days, in 4K.</p>
      <div className="grid big" data-testid="bing-results">
        {page.results.map((r) => (
          <div key={r.sourceId} className="stack" style={{ gap: 8 }}>
            <ResultCard r={r} d={d} />
            <div className="small" style={{ padding: "0 4px" }}>
              {r.title}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
