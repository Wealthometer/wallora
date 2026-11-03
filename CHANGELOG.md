# Changelog

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
