/**
 * What plays next. In order, a playlist walks its list and wraps around; shuffled, it plays every
 * wallpaper once in a random order before any repeats (like a shuffled music playlist), and never
 * the same one twice in a row. "Match daylight" prefers wallpapers whose brightness suits the time.
 */

export type QueueState = { lastId: string | null; bag: string[] };

export type QueueOptions = {
  shuffle: boolean;
  rng: () => number;
  /** Brightness wanted now (0–1) and each wallpaper's brightness; leave out to ignore daylight. */
  daylight?: { target: number; luminance: (id: string) => number };
  /** Already showing on another display this round. */
  exclude?: Set<string>;
};

export const EMPTY_QUEUE: QueueState = { lastId: null, bag: [] };

/** Seeded random numbers (mulberry32), so tests and previews are repeatable. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const TONE_WINDOW = 0.22;

/** Picks the next wallpaper from `pool` (the playlist's items, in order). Returns null for an empty pool. */
export function nextUp(pool: string[], state: QueueState, opts: QueueOptions): { id: string; state: QueueState } | null {
  const exclude = opts.exclude ?? new Set<string>();
  const usable = pool.filter((id) => !exclude.has(id));
  const candidates = usable.length ? usable : pool;
  if (!candidates.length) return null;
  const inPool = new Set(candidates);

  const fits = (id: string) => !opts.daylight || Math.abs(opts.daylight.luminance(id) - opts.daylight.target) <= TONE_WINDOW;

  if (!opts.shuffle) {
    // Walk forward from the last one shown, skipping (while possible) ones that don't suit the light.
    const start = state.lastId ? pool.indexOf(state.lastId) : -1;
    const ordered = Array.from({ length: pool.length }, (_, i) => pool[(start + 1 + i + pool.length) % pool.length]!).filter((id) => inPool.has(id));
    const pick = ordered.find((id) => fits(id) && (id !== state.lastId || ordered.length === 1)) ?? ordered.find((id) => id !== state.lastId) ?? ordered[0]!;
    return { id: pick, state: { lastId: pick, bag: [] } };
  }

  let bag = state.bag.filter((id) => inPool.has(id));
  const refill = () => {
    let next = shuffled(candidates, opts.rng);
    // Don't start a new round with the one that just played.
    if (next.length > 1 && next[0] === state.lastId) next = [...next.slice(1), next[0]!];
    return next;
  };
  if (!bag.length) bag = refill();
  if (opts.daylight && !bag.some(fits) && candidates.some((id) => fits(id) && id !== state.lastId)) bag = refill();

  let pick: string;
  if (opts.daylight) {
    const good = bag.find(fits);
    if (good) pick = good;
    else {
      const d = opts.daylight;
      pick = [...bag].sort((a, b) => Math.abs(d.luminance(a) - d.target) - Math.abs(d.luminance(b) - d.target))[0]!;
    }
  } else pick = bag[0]!;
  if (pick === state.lastId && bag.length > 1) pick = bag.find((id) => id !== state.lastId)!;
  return { id: pick, state: { lastId: pick, bag: bag.filter((id) => id !== pick) } };
}

/** The next `count` wallpapers, without changing anything (for "Up next"). */
export function preview(pool: string[], state: QueueState, opts: QueueOptions, count: number): string[] {
  const out: string[] = [];
  let s = state;
  for (let i = 0; i < count && i < pool.length; i++) {
    const r = nextUp(pool, s, { ...opts, exclude: undefined });
    if (!r) break;
    out.push(r.id);
    s = r.state;
  }
  return out;
}
