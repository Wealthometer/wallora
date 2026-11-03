import { GNOME_OPTION, WINDOWS_POSITION } from "../../shared/displays.ts";
import type { Fit } from "../../shared/types.ts";

/**
 * The commands that actually change the desktop, as plain strings so they can be tested on any OS.
 *
 * Windows: the IDesktopWallpaper COM interface (Windows 8 and later), which is the only API that
 * sets a different picture on each monitor. It's reached from PowerShell with a small C# shim.
 */

const CSHARP = String.raw`
using System;
using System.Runtime.InteropServices;
namespace Wallora {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left; public int Top; public int Right; public int Bottom; }
  [ComImport, Guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IDesktopWallpaper {
    void SetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID, [MarshalAs(UnmanagedType.LPWStr)] string wallpaper);
    [return: MarshalAs(UnmanagedType.LPWStr)] string GetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID);
    [return: MarshalAs(UnmanagedType.LPWStr)] string GetMonitorDevicePathAt(uint monitorIndex);
    [return: MarshalAs(UnmanagedType.U4)] uint GetMonitorDevicePathCount();
    [return: MarshalAs(UnmanagedType.Struct)] Rect GetMonitorRECT([MarshalAs(UnmanagedType.LPWStr)] string monitorID);
    void SetBackgroundColor([MarshalAs(UnmanagedType.U4)] uint color);
    [return: MarshalAs(UnmanagedType.U4)] uint GetBackgroundColor();
    void SetPosition([MarshalAs(UnmanagedType.I4)] int position);
    [return: MarshalAs(UnmanagedType.I4)] int GetPosition();
    void SetSlideshow(IntPtr items);
    IntPtr GetSlideshow();
    void SetSlideshowOptions(int options, uint slideshowTick);
    void GetSlideshowOptions(out int options, out uint slideshowTick);
    void AdvanceSlideshow([MarshalAs(UnmanagedType.LPWStr)] string monitorID, int direction);
    int GetStatus();
    void Enable([MarshalAs(UnmanagedType.Bool)] bool enable);
  }
  [ComImport, Guid("C2CF3110-460E-4FC1-B9D0-8A1C0C9CC4BD")] public class DesktopWallpaperCoClass { }
  public static class Desktop {
    public static IDesktopWallpaper Get() { return (IDesktopWallpaper)new DesktopWallpaperCoClass(); }
  }
}`;

/** A PowerShell single-quoted string: only the quote itself needs doubling. */
export function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

const PRELUDE = `$ErrorActionPreference = 'Stop'\nif (-not ('Wallora.Desktop' -as [type])) { Add-Type -TypeDefinition @'\n${CSHARP}\n'@ }\n$w = [Wallora.Desktop]::Get()\n`;

/** Lists monitors as JSON: [{ id, left, top, right, bottom }]. Detached monitors are skipped. */
export function windowsListScript(): string {
  return (
    PRELUDE +
    `$out = @()
for ($i = 0; $i -lt $w.GetMonitorDevicePathCount(); $i++) {
  $id = $w.GetMonitorDevicePathAt($i)
  try { $r = $w.GetMonitorRECT($id); $out += [pscustomobject]@{ id = $id; left = $r.Left; top = $r.Top; right = $r.Right; bottom = $r.Bottom } } catch { }
}
ConvertTo-Json -InputObject @($out) -Compress`
  );
}

/**
 * Sets wallpapers. `assignments` maps a monitor device path to a picture; a null monitor sets
 * every monitor at once.
 */
export function windowsSetScript(assignments: { monitor: string | null; path: string }[], fit: Fit): string {
  const lines = [PRELUDE, `$w.SetPosition(${WINDOWS_POSITION[fit]})`];
  for (const a of assignments) lines.push(`$w.SetWallpaper(${a.monitor === null ? "$null" : psQuote(a.monitor)}, ${psQuote(a.path)})`);
  lines.push("Write-Output 'ok'");
  return lines.join("\n");
}

/** PowerShell's -EncodedCommand takes base64 of UTF-16LE, which sidesteps every quoting problem. */
export function encodePowerShell(script: string): string {
  const bytes = new Uint8Array(script.length * 2);
  for (let i = 0; i < script.length; i++) {
    const c = script.charCodeAt(i);
    bytes[i * 2] = c & 0xff;
    bytes[i * 2 + 1] = c >> 8;
  }
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// ── macOS ────────────────────────────────────────────────────────────────

function appleQuote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** AppleScript through System Events; desktops are numbered from 1 in the system's display order. */
export function macScript(assignments: { index: number | null; path: string }[]): string {
  const lines = ['tell application "System Events"'];
  for (const a of assignments) {
    if (a.index === null) lines.push(`  set picture of every desktop to POSIX file ${appleQuote(a.path)}`);
    else lines.push(`  if (count of desktops) ≥ ${a.index} then set picture of desktop ${a.index} to POSIX file ${appleQuote(a.path)}`);
  }
  lines.push("end tell");
  return lines.join("\n");
}

// ── Linux ────────────────────────────────────────────────────────────────

export type LinuxDesktop = "gnome" | "kde" | "xfce" | "other";

export function detectLinuxDesktop(env: Record<string, string | undefined>): LinuxDesktop {
  const d = `${env.XDG_CURRENT_DESKTOP ?? ""}:${env.DESKTOP_SESSION ?? ""}`.toLowerCase();
  if (/gnome|unity|budgie|cinnamon|pantheon/.test(d)) return "gnome";
  if (/kde|plasma/.test(d)) return "kde";
  if (/xfce/.test(d)) return "xfce";
  return "other";
}

/** gsettings commands (as argument lists) for GNOME and friends. GNOME shows one picture on all monitors. */
export function gnomeCommands(fileUri: string, fit: Fit): string[][] {
  return [
    ["set", "org.gnome.desktop.background", "picture-uri", fileUri],
    ["set", "org.gnome.desktop.background", "picture-uri-dark", fileUri],
    ["set", "org.gnome.desktop.background", "picture-options", GNOME_OPTION[fit]],
  ];
}

const KDE_FILL: Record<Fit, number> = { stretch: 0, fit: 1, fill: 2, tile: 3, center: 6, span: 2 };

/** A Plasma shell script; `byScreen` maps screen index to file URI, or "*" for all screens. */
export function kdeScript(byScreen: Record<string, string>, fit: Fit): string {
  const map = JSON.stringify(byScreen);
  return `var pics = ${map}; var ds = desktops();
for (var i = 0; i < ds.length; i++) {
  var d = ds[i]; var uri = pics[String(d.screen)] || pics["*"]; if (!uri) continue;
  d.wallpaperPlugin = "org.kde.image";
  d.currentConfigGroup = ["Wallpaper", "org.kde.image", "General"];
  d.writeConfig("Image", uri);
  d.writeConfig("FillMode", ${KDE_FILL[fit]});
}`;
}
