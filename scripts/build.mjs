// Builds the three parts of the app: main process and preload (esbuild), window (Vite).
// `--dev` serves the window from Vite with hot reload and starts Electron against it.
import { build, context } from "esbuild";
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";

const dev = process.argv.includes("--dev");
const require = createRequire(import.meta.url);

const common = { bundle: true, platform: "node", format: "cjs", target: "node22", sourcemap: dev ? "inline" : false, external: ["electron"], logLevel: "warning" };
const entries = [
  { entryPoints: ["src/main/index.ts"], outfile: "dist/main/index.cjs" },
  { entryPoints: ["src/preload/index.ts"], outfile: "dist/preload/index.cjs" },
];

rmSync("dist", { recursive: true, force: true });

if (!dev) {
  await Promise.all(entries.map((e) => build({ ...common, ...e, minify: true })));
  const vite = await import("vite");
  await vite.build({ configFile: "vite.config.ts", logLevel: "warn" });
  console.log("built dist/");
} else {
  const vite = await import("vite");
  const server = await vite.createServer({ configFile: "vite.config.ts" });
  await server.listen(5199);
  const url = "http://localhost:5199/";
  let electron = null;
  const restart = () => {
    if (electron) electron.kill();
    electron = spawn(require("electron"), ["."], { stdio: "inherit", env: { ...process.env, VITE_DEV_URL: url } });
  };
  for (const e of entries) {
    const ctx = await context({ ...common, ...e, plugins: [{ name: "restart", setup: (b) => b.onEnd(() => restart()) }] });
    await ctx.watch();
  }
  console.log(`window on ${url}; Electron restarts when the main process changes`);
}
