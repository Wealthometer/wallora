/**
 * Sunrise, sunset and twilight times, and the sun's height in the sky, from the standard
 * astronomical approximations (accurate to a minute or two away from the poles).
 * After the formulas used by NOAA's solar calculator and SunCalc.
 */

import type { SunEvent } from "./types.ts";

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

const toDays = (ms: number) => ms / DAY_MS - 0.5 + J1970 - J2000;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY_MS);

const meanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);
function eclipticLongitude(m: number): number {
  const c = RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
  return m + c + RAD * 102.9372 + Math.PI;
}
const declination = (l: number) => Math.asin(Math.sin(OBLIQUITY) * Math.sin(l));
const rightAscension = (l: number) => Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY), Math.cos(l));

const J0 = 0.0009;
const approxTransit = (ht: number, lw: number, n: number) => J0 + (ht + lw) / (2 * Math.PI) + n;
const transitJ = (ds: number, m: number, l: number) => J2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l);

/** Degrees below the horizon for each event (sunrise allows for refraction and the sun's size). */
const ANGLE: Record<SunEvent, number> = { dawn: -6, sunrise: -0.833, sunset: -0.833, dusk: -6 };

export type SunTimes = Record<SunEvent, Date | null> & { noon: Date };

/**
 * Times for the day containing `date` at the given place. `null` when the event doesn't happen
 * that day (midnight sun or polar night).
 */
export function sunTimes(date: Date, lat: number, lng: number): SunTimes {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  // Use local noon so "today" means the calendar day the person is in.
  const noonLocal = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).getTime();
  const d = toDays(noonLocal);
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = approxTransit(0, lw, n);
  const m = meanAnomaly(ds);
  const l = eclipticLongitude(m);
  const dec = declination(l);
  const jNoon = transitJ(ds, m, l);

  const at = (deg: number, rising: boolean): Date | null => {
    const cosH = (Math.sin(deg * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (cosH < -1 || cosH > 1) return null;
    const jSet = transitJ(approxTransit(Math.acos(cosH), lw, n), m, l);
    return fromJulian(rising ? jNoon - (jSet - jNoon) : jSet);
  };

  return {
    noon: fromJulian(jNoon),
    dawn: at(ANGLE.dawn, true),
    sunrise: at(ANGLE.sunrise, true),
    sunset: at(ANGLE.sunset, false),
    dusk: at(ANGLE.dusk, false),
  };
}

/** How high the sun is, in degrees (negative below the horizon). */
export function sunAltitude(date: Date, lat: number, lng: number): number {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(date.getTime());
  const l = eclipticLongitude(meanAnomaly(d));
  const dec = declination(l);
  const ra = rightAscension(l);
  const sidereal = RAD * (280.16 + 360.9856235 * d) - lw;
  const h = sidereal - ra;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h)) / RAD;
}

/**
 * How bright a wallpaper should be right now, 0 (night) to 1 (midday), from the sun's height.
 * Without a location, a gentle curve over the clock is used instead (bright 10:00–16:00, dark 22:00–05:00).
 */
export function daylight(date: Date, location: { lat: number; lng: number } | null): number {
  if (location) {
    const alt = sunAltitude(date, location.lat, location.lng);
    // -8° (well into twilight) → 0, 30° and higher → 1.
    return Math.max(0, Math.min(1, (alt + 8) / 38));
  }
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 10 && h <= 16) return 1;
  if (h <= 5 || h >= 22) return 0;
  return h < 10 ? (h - 5) / 5 : (22 - h) / 6;
}
