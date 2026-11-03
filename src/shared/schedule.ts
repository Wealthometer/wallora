import { sunTimes } from "./sun.ts";
import type { Location, RuleTime, ScheduleRule } from "./types.ts";

/**
 * Weekly schedule. Each rule starts a playlist at a time (or sunrise/sunset, with an offset) on
 * some days of the week; the rule that started most recently is the one in charge, until the
 * next rule starts. Days are local: 0 is Sunday.
 */

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** When a rule starts on the calendar day of `day` (local), or null if it can't that day. */
export function startOn(at: RuleTime, day: Date, location: Location | null): Date | null {
  const midnight = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  if (at.kind === "time") {
    return new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate(), Math.floor(at.minutes / 60), at.minutes % 60);
  }
  if (!location) return null;
  const t = sunTimes(midnight, location.lat, location.lng)[at.event];
  return t ? new Date(t.getTime() + at.offset * 60_000) : null;
}

export type Starts = { rule: ScheduleRule; at: Date };

/** Every start of every enabled rule between `from` and `to`, oldest first. */
export function startsBetween(rules: ScheduleRule[], from: Date, to: Date, location: Location | null): Starts[] {
  const out: Starts[] = [];
  const first = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1);
  for (let day = first; day <= to; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    for (const rule of rules) {
      if (!rule.enabled || !rule.days.includes(day.getDay())) continue;
      const at = startOn(rule.at, day, location);
      if (at && at >= from && at <= to) out.push({ rule, at });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export type ActiveRule = { rule: ScheduleRule; since: Date } | null;

/** The rule in charge at `now`: the latest start in the past week. */
export function activeRule(rules: ScheduleRule[], now: Date, location: Location | null): ActiveRule {
  const past = startsBetween(rules, new Date(now.getTime() - 8 * 86_400_000), now, location);
  const last = past.at(-1);
  return last ? { rule: last.rule, since: last.at } : null;
}

/** The next time a rule starts after `now` (within a week). */
export function nextStart(rules: ScheduleRule[], now: Date, location: Location | null): Starts | null {
  return startsBetween(rules, new Date(now.getTime() + 1000), new Date(now.getTime() + 8 * 86_400_000), location)[0] ?? null;
}

/** Blocks for drawing a week: for each day, which playlist plays from when to when. */
export function weekBlocks(rules: ScheduleRule[], weekStart: Date, location: Location | null): { day: number; from: number; to: number; playlistId: string; ruleId: string }[][] {
  const start = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  const before = activeRule(rules, start, location);
  const starts = startsBetween(rules, start, end, location);
  const days: { day: number; from: number; to: number; playlistId: string; ruleId: string }[][] = Array.from({ length: 7 }, () => []);
  let current = before ? { playlistId: before.rule.playlistId, ruleId: before.rule.id, at: start } : null;
  const flush = (until: Date) => {
    if (!current) return;
    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const dayEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i + 1);
      const a = Math.max(current.at.getTime(), dayStart.getTime());
      const b = Math.min(until.getTime(), dayEnd.getTime());
      if (b > a) days[i]!.push({ day: dayStart.getDay(), from: (a - dayStart.getTime()) / 60_000, to: (b - dayStart.getTime()) / 60_000, playlistId: current.playlistId, ruleId: current.ruleId });
    }
  };
  for (const s of starts) {
    // The same playlist starting again is one continuous block.
    if (current && current.playlistId === s.rule.playlistId) continue;
    flush(s.at);
    current = { playlistId: s.rule.playlistId, ruleId: s.rule.id, at: s.at };
  }
  flush(end);
  return days;
}

export function formatMinutes(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function parseTime(s: string): number | null {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

const EVENT_LABEL = { dawn: "dawn", sunrise: "sunrise", sunset: "sunset", dusk: "dusk" } as const;

export function describeTime(at: RuleTime): string {
  if (at.kind === "time") return formatMinutes(at.minutes);
  if (!at.offset) return `At ${EVENT_LABEL[at.event]}`;
  const abs = Math.abs(at.offset);
  const amount = abs >= 60 && abs % 60 === 0 ? `${abs / 60} h` : `${abs} min`;
  return `${amount} ${at.offset < 0 ? "before" : "after"} ${EVENT_LABEL[at.event]}`;
}

export function describeDays(days: number[]): string {
  const s = [...new Set(days)].sort();
  if (s.length === 7) return "Every day";
  if (s.join() === "1,2,3,4,5") return "Weekdays";
  if (s.join() === "0,6") return "Weekends";
  if (!s.length) return "Never";
  return s.map((d) => DAY_SHORT[d]).join(", ");
}
