import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Heart, ImageOff, X, type LucideIcon } from "lucide-react";
import type { Wallpaper } from "../../shared/types.ts";
import { thumb } from "../store.ts";

export function Toggle({ label, detail, value, onChange, testId }: { label: string; detail?: string; value: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <div
      className={`toggle${value ? " on" : ""}`}
      role="switch"
      aria-checked={value}
      aria-label={label}
      tabIndex={0}
      data-testid={testId}
      onClick={() => onChange(!value)}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange(!value);
        }
      }}
    >
      <div className="grow">
        <div className="h3">{label}</div>
        {detail ? <div className="small">{detail}</div> : null}
      </div>
      <div className="switch" />
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, testId }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; testId?: string }) {
  return (
    <div className="seg" role="radiogroup" data-testid={testId}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)} data-testid={testId ? `${testId}-${o.value}` : undefined}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Modal({ title, onClose, children, testId }: { title: string; onClose: () => void; children: ReactNode; testId?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <>
      <div className="scrim modal-scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
        <div className="row" style={{ marginBottom: 16 }}>
          <h2 className="h2 grow">{title}</h2>
          <button className="btn icon ghost" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}

export type MenuItem = { label: string; icon?: LucideIcon; onClick: () => void; danger?: boolean; testId?: string } | "sep" | { heading: string };

/** A context menu at a screen position. */
export function Menu({ at, items, onClose }: { at: { x: number; y: number }; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const x = Math.min(at.x, window.innerWidth - r.width - 8);
      const y = Math.min(at.y, window.innerHeight - r.height - 8);
      if (x !== at.x || y !== at.y) setTimeout(() => setPos({ x, y }), 0);
    }
    const close = () => onClose();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    setTimeout(() => window.addEventListener("click", close, { once: true }), 0);
    return () => {
      window.removeEventListener("keydown", k);
      window.removeEventListener("click", close);
    };
  }, [at, onClose]);
  return createPortal(
    <div className="menu" ref={ref} style={{ left: pos.x, top: pos.y }} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it === "sep" ? (
          <div key={i} className="sep" />
        ) : "heading" in it ? (
          <div key={i} className="label">
            {it.heading}
          </div>
        ) : (
          <button
            key={i}
            role="menuitem"
            data-testid={it.testId}
            style={it.danger ? { color: "var(--danger)" } : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
              it.onClick();
            }}
          >
            {it.icon ? <it.icon size={16} /> : null}
            {it.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

export function Tile({
  w,
  selected,
  onClick,
  onContextMenu,
  onToggle,
  badges,
  testId,
  delay = 0,
}: {
  w: Wallpaper;
  selected?: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onToggle?: () => void;
  badges?: ReactNode;
  testId?: string;
  delay?: number;
}) {
  return (
    <button
      className={`tile${selected ? " selected" : ""}${w.missing ? " missing" : ""}`}
      style={{ ["--glow" as string]: `${w.accent}88`, animationDelay: `${Math.min(delay, 20) * 25}ms` }}
      onClick={(e) => (e.shiftKey || e.ctrlKey || e.metaKey) && onToggle ? onToggle() : onClick()}
      onContextMenu={onContextMenu}
      aria-label={w.title}
      aria-pressed={selected}
      data-testid={testId ?? `tile-${w.title}`}
    >
      <img src={thumb(w.id)} alt="" loading="lazy" draggable={false} />
      <div className="swatches">
        {w.colors.slice(0, 4).map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
      </div>
      {onToggle ? (
        <span
          className="check"
          role="checkbox"
          aria-checked={!!selected}
          aria-label={`Select ${w.title}`}
          data-testid={`select-${w.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {selected ? <Check size={15} strokeWidth={3} /> : null}
        </span>
      ) : null}
      <div className="badges">
        {w.missing ? (
          <span className="badge warn" title="The file is missing">
            <ImageOff size={12} />
          </span>
        ) : null}
        {w.favourite ? (
          <span className="badge accent" aria-label="Favourite">
            <Heart size={12} fill="currentColor" />
          </span>
        ) : null}
        {badges}
      </div>
      <div className="shade">
        <span className="name">{w.title}</span>
        <span className="small" style={{ color: "rgba(255,255,255,.75)" }}>
          {w.width}×{w.height}
        </span>
      </div>
    </button>
  );
}

export function Mosaic({ ids, size, empty }: { ids: string[]; size?: number; empty?: ReactNode }) {
  const list = ids.slice(0, 4);
  return (
    <div className={`mosaic${list.length > 0 && list.length < 4 ? " one" : ""}`} style={size ? { width: size } : undefined}>
      {list.length === 0 ? <div className="empty">{empty}</div> : list.length < 4 ? <img src={thumb(list[0]!)} alt="" /> : list.map((id) => <img key={id} src={thumb(id)} alt="" />)}
    </div>
  );
}

export function Empty({ icon: I, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="orb">
        <I size={42} />
      </div>
      <h2 className="h2" style={{ color: "var(--text)" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

/** Re-renders every `ms` so countdowns stay live. */
export function useClock(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function untilText(at: number, now: number): string {
  const s = Math.max(0, Math.round((at - now) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

export function agoText(t: number, now: number): string {
  const s = (now - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function bytesText(b: number): string {
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
