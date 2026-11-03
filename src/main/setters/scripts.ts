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
  public static class Native {
    [DllImport("user32.dll", SetLastError = true)] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool SystemParametersInfo(uint action, uint param, string value, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string name);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string name);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    // Puts a window directly above the desktop (the window holding the icons): under every
    // app window, but still visible. Pushing it to the very bottom could hide it behind the desktop.
    public static bool PinAboveDesktop(IntPtr h) {
      IntPtr host = IntPtr.Zero;
      EnumWindows((w, l) => { if (FindWindowEx(w, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero) { host = w; return false; } return true; }, IntPtr.Zero);
      if (host == IntPtr.Zero) host = FindWindow("Progman", null);
      if (host == IntPtr.Zero) return SetWindowPos(h, (IntPtr)1, 0, 0, 0, 0, 0x0013);
      IntPtr above = GetWindow(host, 3);
      if (above == h) return true;
      return SetWindowPos(h, above == IntPtr.Zero ? IntPtr.Zero : above, 0, 0, 0, 0, 0x0013);
    }
  }
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

/** Registry values for the classic single-picture API, used if the per-monitor one fails. */
export const WINDOWS_STYLE: Record<Fit, [string, string]> = { fill: ["10", "0"], fit: ["6", "0"], stretch: ["2", "0"], center: ["0", "0"], tile: ["0", "1"], span: ["22", "0"] };

export const HOST_MARK = "@@WALLORA ";

/**
 * A long-lived PowerShell helper. It compiles the C# shim once, then answers one JSON command per
 * line on stdin with one marked JSON line on stdout. Every command catches its own errors, so a
 * failure comes back as a readable message instead of PowerShell's CLIXML error stream, and
 * commands never overlap (two PowerShells compiling the shim at once can fail).
 *
 * Commands: {id, op:"ping"} · {id, op:"list"} · {id, op:"set", fit, items:[{monitor, path}]} ·
 * {id, op:"bottom", hwnd}.
 */
export function windowsHostScript(): string {
  const styles = Object.entries(WINDOWS_STYLE)
    .map(([k, [st, tile]]) => `'${k}' = @('${st}', '${tile}')`)
    .join("; ");
  const positions = Object.entries(WINDOWS_POSITION)
    .map(([k, v]) => `'${k}' = ${v}`)
    .join("; ");
  return `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8
function Reply($obj) { [Console]::Out.WriteLine('${HOST_MARK}' + ($obj | ConvertTo-Json -Compress -Depth 6)); [Console]::Out.Flush() }
try { if (-not ('Wallora.Desktop' -as [type])) { Add-Type -TypeDefinition @'
${CSHARP}
'@ } } catch { Reply @{ id = 0; ok = $false; error = 'Could not prepare the Windows wallpaper helper: ' + $_.Exception.Message }; exit 1 }
$styles = @{ ${styles} }
$positions = @{ ${positions} }
function Set-Classic($path, $fit) {
  $st = $styles[$fit]
  Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name WallpaperStyle -Value $st[0]
  Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name TileWallpaper -Value $st[1]
  if (-not [Wallora.Native]::SystemParametersInfo(0x14, 0, $path, 3)) { throw "SystemParametersInfo failed ($([Runtime.InteropServices.Marshal]::GetLastWin32Error()))" }
}
Reply @{ id = 0; ok = $true; data = 'ready' }
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line.Trim() -eq '') { continue }
  $id = 0
  try {
    $cmd = $line | ConvertFrom-Json
    $id = $cmd.id
    switch ($cmd.op) {
      'ping' { Reply @{ id = $id; ok = $true; data = 'pong' } }
      'list' {
        $w = [Wallora.Desktop]::Get()
        $out = @()
        for ($i = 0; $i -lt $w.GetMonitorDevicePathCount(); $i++) {
          $mid = $w.GetMonitorDevicePathAt($i)
          try { $r = $w.GetMonitorRECT($mid); $out += @{ id = $mid; left = $r.Left; top = $r.Top; right = $r.Right; bottom = $r.Bottom } } catch { }
        }
        Reply @{ id = $id; ok = $true; data = @($out) }
      }
      'set' {
        $notes = @()
        $done = 0
        $w = $null
        try { $w = [Wallora.Desktop]::Get(); $w.SetPosition($positions[$cmd.fit]) } catch { $notes += 'per-monitor API unavailable: ' + $_.Exception.Message; $w = $null }
        foreach ($it in @($cmd.items)) {
          $ok = $false
          if ($null -ne $w) {
            try { $w.SetWallpaper($it.monitor, $it.path); $ok = $true } catch { $notes += 'monitor ' + $it.monitor + ': ' + $_.Exception.Message }
            if (-not $ok -and $null -ne $it.monitor) { try { $w.SetWallpaper($null, $it.path); $ok = $true } catch { } }
          }
          if (-not $ok) { Set-Classic $it.path $cmd.fit; $ok = $true; $notes += 'used the single-picture fallback' }
          if ($ok) { $done++ }
        }
        Reply @{ id = $id; ok = $true; data = @{ done = $done; notes = @($notes) } }
      }
      'bottom' {
        $h = [IntPtr][long]$cmd.hwnd
        [void][Wallora.Native]::PinAboveDesktop($h)
        Reply @{ id = $id; ok = $true; data = $true }
      }
      default { Reply @{ id = $id; ok = $false; error = 'unknown command' } }
    }
  } catch {
    Reply @{ id = $id; ok = $false; error = $_.Exception.Message }
  }
}`;
}

export type HostReply = { id: number; ok: boolean; data?: unknown; error?: string };

/** Reads one helper line; anything else PowerShell prints is ignored. */
export function parseHostLine(line: string): HostReply | null {
  const i = line.indexOf(HOST_MARK);
  if (i < 0) return null;
  try {
    const r = JSON.parse(line.slice(i + HOST_MARK.length)) as HostReply;
    return typeof r.id === "number" && typeof r.ok === "boolean" ? r : null;
  } catch {
    return null;
  }
}

/**
 * PowerShell writes errors to stderr as CLIXML ("#< CLIXML" then XML) when its output is
 * redirected. Pulls out the human-readable error lines.
 */
export function decodeClixml(stderr: string): string {
  if (!stderr.includes("#< CLIXML")) return stderr.trim();
  const out: string[] = [];
  const re = /<S S="Error">([\s\S]*?)<\/S>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr))) {
    const text = m[1]!
      .replace(/_x([0-9A-F]{4})_/gi, (_s, h: string) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
    out.push(text);
  }
  return out.join("").replace(/\s+/g, " ").trim() || "PowerShell reported an error without details";
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
