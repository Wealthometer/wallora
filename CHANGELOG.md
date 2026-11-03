# Changelog

## 1.1.0 — 2026-11-03

- **Desktop widgets**, Rainmeter-style: clock (six faces), date, calendar, system stats, weather, note, countdown and now playing. Five fonts, auto colour that reads on the wallpaper, size, opacity, glass or solid panels, six one-click looks. Drag them on a live preview of each screen or on the desktop itself. They sit under your windows (or always on top), let clicks through, and remember their place per monitor.
- **New look**: a floating glass sidebar and sheet over your blurred wallpaper, "Now showing" puts your desktop (widgets included) on a monitor, a quick "next" in the sidebar, a floating player dock, a scrolling Up next strip, a livelier welcome, and smoother transitions between views.
- **Fixed on Windows**: "Windows didn't accept the wallpaper: #< CLIXML". Wallpaper changes now go through one long-running PowerShell helper that compiles its shim once, runs one change at a time, reports Windows' actual reason when something fails, and falls back to the single-picture API if the per-monitor one refuses. Changes are also much faster after the first.

## 1.0.0 — 2026-11-03

First release.

- Library from watched folders (new, moved and deleted files are noticed) and added pictures (copied in, duplicates skipped by file hash). Search, sort, light/dark and colour filters, favourites, collections, details with palette and sharpness per display.
- Playlists that play wallpapers like music: in order or shuffled (every picture once before any repeats), an interval from every minute to once a week, play/pause/next/previous from the player bar, tray or global shortcuts. Smart playlists fill themselves from collections, favourites, colour, brightness, size and source.
- Schedule: rules start a playlist at a clock time or at dawn, sunrise, sunset or dusk (worked out on the computer from your city, with an offset), shown on a week chart. A playlist picked by hand lasts until the next rule.
- Match the daylight: brighter wallpapers in the day, darker at night.
- Multiple monitors: the same picture everywhere, a different one on each, or a playlist per display; fill, fit, stretch, centre, tile or span.
- Dominant colours for every picture; the app's own accent colour follows the wallpaper on screen.
- Discover: Wallhaven search (safe-for-work only, optional API key) and Bing's photo of the day, downloaded straight into the library with credits.
- History of every change, with one click to bring a picture back.
- Windows (IDesktopWallpaper, per monitor), macOS (System Events) and Linux (GNOME, KDE Plasma, Xfce, feh) support. Tray, start at login, pause on battery.
- 19 unit tests, 7 Electron journeys, CI on Windows, macOS and Linux, installers with electron-builder.
