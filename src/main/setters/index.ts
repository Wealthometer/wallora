import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { screen } from "electron";
import { matchMonitors, type MonitorRect } from "../../shared/displays.ts";
import type { DisplayInfo, Settings } from "../../shared/types.ts";
import type { Assignment, Setter } from "../engine.ts";
import { detectLinuxDesktop, gnomeCommands, kdeScript, macScript } from "./scripts.ts";
import { WinHost } from "./winhost.ts";

const run = promisify(execFile);
const OPTS = { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 };

/** Windows 8+: IDesktopWallpaper through a long-lived PowerShell helper, one picture per monitor. */
class WindowsSetter implements Setter {
  name = "Windows";
  perDisplay = true;
  readonly host = new WinHost();
  private monitors: MonitorRect[] | null = null;
  private layout = "";

  private async monitorMap(displays: DisplayInfo[]): Promise<Map<string, string>> {
    const layout = JSON.stringify(displays.map((d) => [d.id, d.bounds]));
    if (!this.monitors || layout !== this.layout) {
      this.monitors = await this.host.call<MonitorRect[]>("list");
      this.layout = layout;
    }
    return matchMonitors(displays, this.monitors, (d) => screen.dipToScreenRect(null, d.bounds));
  }

  async set(assignments: Assignment[], settings: Settings, displays: DisplayInfo[]): Promise<void> {
    const perMonitor = assignments.some((a) => a.display);
    let map = new Map<string, string>();
    if (perMonitor) {
      try {
        map = await this.monitorMap(displays);
      } catch {
        // Can't tell monitors apart: every picture goes to all of them (the last one wins).
      }
    }
    const items = assignments.map((a) => ({ monitor: a.display ? (map.get(a.display.id) ?? null) : null, path: a.path }));
    try {
      await this.host.call("set", { fit: settings.fit, items });
    } catch (e) {
      this.monitors = null;
      throw new Error(`Windows didn't accept the wallpaper: ${(e as Error).message.slice(0, 220)}`);
    }
  }

  /** Pins a widget window just above the desktop, under every app window (Rainmeter's "on desktop"). */
  async sendToBottom(hwnd: string): Promise<void> {
    await this.host.call("bottom", { hwnd });
  }
}

class MacSetter implements Setter {
  name = "macOS";
  perDisplay = true;
  async set(assignments: Assignment[], _settings: Settings, displays: DisplayInfo[]): Promise<void> {
    // System Events numbers desktops with the main display first.
    const order = [...displays].sort((a, b) => Number(b.primary) - Number(a.primary) || a.bounds.x - b.bounds.x);
    const list = assignments.map((a) => ({ index: a.display ? order.findIndex((d) => d.id === a.display!.id) + 1 : null, path: a.path }));
    try {
      await run("osascript", ["-e", macScript(list)], OPTS);
    } catch (e) {
      throw new Error(`macOS didn't accept the wallpaper. Allow Wallora to control System Events in Privacy & Security → Automation. (${(e as Error).message.slice(0, 120)})`);
    }
  }
}

class GnomeSetter implements Setter {
  name = "GNOME";
  perDisplay = false;
  async set(assignments: Assignment[], settings: Settings): Promise<void> {
    for (const args of gnomeCommands(pathToFileURL(assignments[0]!.path).href, settings.fit)) await run("gsettings", args, OPTS);
  }
}

class KdeSetter implements Setter {
  name = "KDE Plasma";
  perDisplay = true;
  async set(assignments: Assignment[], settings: Settings, displays: DisplayInfo[]): Promise<void> {
    const byScreen: Record<string, string> = {};
    for (const a of assignments) byScreen[a.display ? String(displays.findIndex((d) => d.id === a.display!.id)) : "*"] = pathToFileURL(a.path).href;
    const args = ["org.kde.plasmashell", "/PlasmaShell", "org.kde.PlasmaShell.evaluateScript", kdeScript(byScreen, settings.fit)];
    try {
      await run("qdbus6", args, OPTS);
    } catch {
      await run("qdbus", args, OPTS);
    }
  }
}

class XfceSetter implements Setter {
  name = "Xfce";
  perDisplay = false;
  async set(assignments: Assignment[]): Promise<void> {
    const { stdout } = await run("xfconf-query", ["-c", "xfce4-desktop", "-l"], OPTS);
    const props = stdout.split("\n").filter((p) => p.endsWith("/last-image"));
    if (!props.length) throw new Error("Couldn't find Xfce's desktop settings");
    for (const p of props) await run("xfconf-query", ["-c", "xfce4-desktop", "-p", p, "-s", assignments[0]!.path], OPTS);
  }
}

/** Plain X11 window managers: feh draws one picture per monitor, in order. */
class FehSetter implements Setter {
  name = "feh";
  perDisplay = true;
  async set(assignments: Assignment[], settings: Settings, displays: DisplayInfo[]): Promise<void> {
    const flag = { fill: "--bg-fill", fit: "--bg-max", stretch: "--bg-scale", center: "--bg-center", tile: "--bg-tile", span: "--bg-fill" }[settings.fit];
    const paths = assignments.some((a) => a.display) ? displays.map((d) => assignments.find((a) => a.display?.id === d.id)?.path ?? assignments[0]!.path) : [assignments[0]!.path];
    try {
      await run("feh", ["--no-fehbg", flag, ...paths], OPTS);
    } catch {
      throw new Error("Wallora can't change the wallpaper on this desktop. Install feh, or use GNOME, KDE or Xfce.");
    }
  }
}

/** For tests and demos: writes what it would have done to a JSON file. */
class FakeSetter implements Setter {
  name = "Preview (test mode)";
  perDisplay = true;
  file: string;
  constructor(file: string) {
    this.file = file;
  }
  async set(assignments: Assignment[], settings: Settings): Promise<void> {
    await writeFile(this.file, JSON.stringify({ at: Date.now(), fit: settings.fit, assignments: assignments.map((a) => ({ display: a.display?.id ?? null, path: a.path })) }));
  }
}

export { WindowsSetter };

export function pickSetter(env: NodeJS.ProcessEnv = process.env): Setter {
  if (env.WALLORA_FAKE_DESKTOP) return new FakeSetter(env.WALLORA_FAKE_DESKTOP);
  if (process.platform === "win32") return new WindowsSetter();
  if (process.platform === "darwin") return new MacSetter();
  switch (detectLinuxDesktop(env)) {
    case "gnome":
      return new GnomeSetter();
    case "kde":
      return new KdeSetter();
    case "xfce":
      return new XfceSetter();
    default:
      return new FehSetter();
  }
}
