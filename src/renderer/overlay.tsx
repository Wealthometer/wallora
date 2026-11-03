import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/instrument-serif/400.css";
import "@fontsource-variable/manrope/index.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "@fontsource-variable/unbounded/index.css";
import "./widgets/widgets.css";
import type { Bridge, OverlayState } from "../shared/api.ts";
import { WidgetLayer, useWidgetData } from "./widgets/WidgetView.tsx";

/**
 * A widget window: transparent and the size of one display's work area. It draws that display's
 * widgets; while editing, they can be dragged and a small bar offers "Done".
 */
const api = (window as unknown as { wallora: Bridge }).wallora;

function Overlay() {
  const [state, setState] = useState<OverlayState | null>(null);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    void api.overlayState().then(setState);
    const off = api.on("overlay", setState);
    const resize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => {
      off();
      window.removeEventListener("resize", resize);
    };
  }, []);

  const widgets = state?.widgets ?? [];
  const data = useWidgetData(api, widgets, state?.location ?? null);
  if (!state) return null;

  return (
    <>
      <WidgetLayer
        widgets={widgets}
        width={size.w}
        height={size.h}
        editing={state.editing}
        selected={selected}
        onSelect={setSelected}
        onMove={(id, x, y) => {
          // Show the new place straight away; the confirmed state follows from the app.
          setState((s) => (s ? { ...s, widgets: s.widgets.map((w) => (w.id === id ? { ...w, x, y } : w)) } : s));
          void api.updateWidget(id, { x, y });
        }}
        ctx={{ ...data, wallpaper: state.wallpaper, playlistName: state.playlistName, nextAt: state.nextAt, location: state.location }}
        testId="overlay-layer"
      />
      {state.editing ? (
        <div className="ov-bar">
          <span>Drag widgets where you want them</span>
          <button onClick={() => void api.setEditingWidgets(false)} data-testid="overlay-done">
            Done
          </button>
        </div>
      ) : null}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
