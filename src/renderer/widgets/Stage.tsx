import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { AnyWidget } from "../../shared/widgets.ts";
import type { DisplayInfo, Fit } from "../../shared/types.ts";
import { api, full, useStore } from "../store.ts";
import { WidgetLayer, useWidgetData, type WidgetCtx } from "./WidgetView.tsx";

const FIT_CSS: Record<Fit, { objectFit: "cover" | "contain" | "fill" | "none"; repeat?: boolean }> = {
  fill: { objectFit: "cover" },
  span: { objectFit: "cover" },
  fit: { objectFit: "contain" },
  stretch: { objectFit: "fill" },
  center: { objectFit: "none" },
  tile: { objectFit: "cover", repeat: true },
};

/** What a display's widgets need to know about the wallpaper under them. */
export function useDisplayCtx(display: DisplayInfo | undefined, widgets: AnyWidget[]): WidgetCtx {
  const snap = useStore((s) => s.snap)!;
  const byId = useStore((s) => s.byId);
  const w = display ? byId.get(snap.now.current[display.id] ?? "") : undefined;
  const data = useWidgetData(api, widgets, snap.settings.location?.name ?? null);
  return {
    ...data,
    wallpaper: w ? { id: w.id, title: w.title, colors: w.colors, accent: w.accent, luminance: w.luminance } : null,
    playlistName: snap.now.playlistName,
    nextAt: snap.now.nextAt,
    location: snap.settings.location?.name ?? null,
  };
}

/**
 * A display drawn as a monitor: its wallpaper as it's set, with its widgets on top at the same
 * proportions as on the real screen. With `editing`, widgets can be dragged.
 */
export function Stage({
  display,
  editing = false,
  selected = null,
  onSelect,
  overlay,
  testId,
  compact = false,
}: {
  display: DisplayInfo;
  editing?: boolean;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  overlay?: ReactNode;
  testId?: string;
  compact?: boolean;
}) {
  const snap = useStore((s) => s.snap)!;
  const widgets = snap.settings.widgetsEnabled || editing ? snap.widgets.filter((w) => w.display === display.id) : [];
  const ctx = useDisplayCtx(display, widgets);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const dw = display.bounds.width;
  const dh = display.bounds.height;
  const scale = width ? width / dw : 0;
  const fit = FIT_CSS[snap.settings.fit];
  const wp = ctx.wallpaper;

  return (
    <div className={`stage${compact ? " compact" : ""}`} data-testid={testId}>
      <div className="stage-screen" ref={box} style={{ aspectRatio: `${dw} / ${dh}` }}>
        {wp ? (
          fit.repeat ? (
            <div key={wp.id} className="stage-wall tiled" style={{ backgroundImage: `url("${full(wp.id)}")`, backgroundSize: `${Math.max(60, 320 * scale * 3)}px auto` }} />
          ) : (
            <img key={wp.id} className="stage-wall" src={full(wp.id)} alt="" style={{ objectFit: fit.objectFit }} />
          )
        ) : (
          <div className="stage-wall empty" />
        )}
        {scale ? (
          <div className="stage-layer" style={{ width: dw, height: dh, transform: `scale(${scale})` }}>
            <WidgetLayer
              widgets={widgets}
              width={dw}
              height={dh}
              ctx={ctx}
              editing={editing}
              scale={scale}
              selected={selected}
              onSelect={onSelect}
              onMove={(id, x, y) => void api.updateWidget(id, { x, y })}
              testId={testId ? `${testId}-layer` : undefined}
            />
          </div>
        ) : null}
        {overlay}
      </div>
      {compact ? null : <div className="stage-stand" aria-hidden />}
    </div>
  );
}
