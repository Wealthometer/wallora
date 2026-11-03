import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/manrope/index.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "@fontsource-variable/unbounded/index.css";
import "./widgets/widgets.css";
import "./styles.css";
import { App } from "./App.tsx";
import { boot } from "./store.ts";

void boot().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
