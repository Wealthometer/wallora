import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const page = (name: string) => fileURLToPath(new URL(`./src/renderer/${name}.html`, import.meta.url));

export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    target: "chrome140",
    // The app window and the desktop widget windows.
    rollupOptions: { input: { index: page("index"), overlay: page("overlay") } },
  },
});
