import { useState } from "react";
import { CalendarClock, Pencil, Plus, Sunrise, Sunset, Trash2 } from "lucide-react";
import { inkOn } from "../../shared/color.ts";
import { activeRule, DAY_SHORT, describeDays, describeTime, formatMinutes, parseTime, weekBlocks } from "../../shared/schedule.ts";
import { sunTimes } from "../../shared/sun.ts";
import type { RuleTime, ScheduleRule, SunEvent } from "../../shared/types.ts";
import { api, go, run, useStore } from "../store.ts";
import { Empty, Field, Modal, Seg, Toggle, useClock } from "../ui/kit.tsx";

const FALLBACK = ["#A89BFF", "#FF8FB1", "#FFD36E", "#6EE7D8", "#8FD3FF", "#C3F27A"];

export function ScheduleView() {
  const snap = useStore((s) => s.snap)!;
  const byId = useStore((s) => s.byId);
  const now = useClock(60_000);
  const [editing, setEditing] = useState<ScheduleRule | "new" | null>(null);
  const loc = snap.settings.location;
  const today = new Date(now);
  // Weeks start on Monday.
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const week = weekBlocks(snap.rules, monday, loc);
  const colorOf = (pid: string) => {
    const p = snap.playlists.find((x) => x.id === pid);
    const first = p?.cover[0] ? byId.get(p.cover[0])?.accent : undefined;
    return first ?? FALLBACK[snap.playlists.findIndex((x) => x.id === pid) % FALLBACK.length] ?? FALLBACK[0]!;
  };
  const nameOf = (pid: string) => snap.playlists.find((p) => p.id === pid)?.name ?? "Deleted playlist";
  const active = activeRule(snap.rules, today, loc);
  const sun = loc ? sunTimes(today, loc.lat, loc.lng) : null;
  const t = (d: Date | null) => (d ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—");
  const needsLocation = snap.rules.some((r) => r.at.kind === "sun") && !loc;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Schedule</div>
          <h1 className="title">
            Mornings, nights, <em>weekends</em>
          </h1>
          <p className="subtitle">Start a playlist at a time of day or at sunrise and sunset. The latest rule to start plays until the next one does.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing("new")} disabled={!snap.playlists.length} data-testid="add-rule">
          <Plus size={16} /> Add rule
        </button>
      </div>

      <div className="card tight" style={{ marginBottom: 18 }}>
        <Toggle
          label="Follow the schedule"
          detail={
            active
              ? snap.now.reason === "manual"
                ? `${nameOf(active.rule.playlistId)} is due since ${t(active.since)}, but you picked ${snap.now.playlistName ?? "a playlist"} by hand. It takes over again at the next rule, or from Now showing.`
                : `Now: ${nameOf(active.rule.playlistId)}, since ${t(active.since)}`
              : snap.rules.length
                ? "No rule has started yet this week"
                : "Add a rule to get started"
          }
          value={snap.settings.scheduleEnabled}
          onChange={(v) => void run(api.updateSettings({ scheduleEnabled: v }))}
          testId="schedule-enabled"
        />
      </div>

      {needsLocation ? (
        <div className="card row" style={{ marginBottom: 18, borderColor: "var(--accent-line)" }}>
          <Sunset size={20} />
          <span className="grow">Sunrise and sunset rules need your location. Without it they don't run.</span>
          <button className="btn small primary" onClick={() => go({ name: "settings" })}>
            Set location
          </button>
        </div>
      ) : null}

      {!snap.playlists.length ? (
        <Empty icon={CalendarClock} title="Make a playlist first">
          <p style={{ margin: 0 }}>Rules start playlists, so you'll need at least one.</p>
        </Empty>
      ) : (
        <>
          <div className="card" data-testid="week">
            <div className="row" style={{ marginBottom: 14 }}>
              <h2 className="h3 grow">This week</h2>
              {sun ? (
                <span className="small row" style={{ gap: 12 }}>
                  <span>
                    <Sunrise size={14} style={{ verticalAlign: -2 }} /> {t(sun.sunrise)}
                  </span>
                  <span>
                    <Sunset size={14} style={{ verticalAlign: -2 }} /> {t(sun.sunset)}
                  </span>
                </span>
              ) : null}
            </div>
            <div className="week">
              {week.map((blocks, i) => {
                const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
                const isToday = day.toDateString() === today.toDateString();
                return (
                  <div key={i} style={{ display: "contents" }}>
                    <div className={`day${isToday ? " today" : ""}`}>{DAY_SHORT[day.getDay()]}</div>
                    <div className="lane">
                      {blocks.map((b, j) => {
                        const c = colorOf(b.playlistId);
                        return (
                          <div key={j} className="block" style={{ left: `${(b.from / 1440) * 100}%`, width: `${((b.to - b.from) / 1440) * 100}%`, background: c, color: inkOn(c) }} title={`${nameOf(b.playlistId)} ${formatMinutes(b.from)}–${formatMinutes(b.to)}`}>
                            {b.to - b.from > 120 ? nameOf(b.playlistId) : ""}
                          </div>
                        );
                      })}
                      {isToday ? <div className="nowline" style={{ left: `${((today.getHours() * 60 + today.getMinutes()) / 1440) * 100}%` }} /> : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hours" style={{ marginTop: 6 }}>
              {["00", "03", "06", "09", "12", "15", "18", "21", "24"].map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>
          </div>

          <div className="section stack" style={{ gap: 8 }} data-testid="rules">
            {snap.rules.map((r) => (
              <div key={r.id} className="card row" style={{ padding: "12px 16px", opacity: r.enabled ? 1 : 0.55 }} data-testid={`rule-${nameOf(r.playlistId)}`}>
                <span style={{ width: 14, height: 14, borderRadius: 5, background: colorOf(r.playlistId) }} />
                <div className="grow">
                  <div className="h3">
                    {describeTime(r.at)} · {nameOf(r.playlistId)}
                  </div>
                  <div className="small">
                    {describeDays(r.days)}
                    {r.at.kind === "sun" && !loc ? " · needs your location" : ""}
                  </div>
                </div>
                <button className="btn small" onClick={() => void run(api.saveRule({ ...r, enabled: !r.enabled }))}>
                  {r.enabled ? "Turn off" : "Turn on"}
                </button>
                <button className="btn icon small ghost" aria-label="Edit rule" onClick={() => setEditing(r)}>
                  <Pencil size={14} />
                </button>
                <button className="btn icon small ghost" aria-label="Delete rule" onClick={() => void run(api.deleteRule(r.id))} data-testid="delete-rule">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {editing ? <RuleEditor rule={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function RuleEditor({ rule, onClose }: { rule: ScheduleRule | null; onClose: () => void }) {
  const snap = useStore((s) => s.snap)!;
  const [days, setDays] = useState<number[]>(rule?.days ?? [1, 2, 3, 4, 5]);
  const [kind, setKind] = useState<"time" | "sun">(rule?.at.kind ?? "time");
  const [time, setTime] = useState(rule?.at.kind === "time" ? formatMinutes(rule.at.minutes) : "07:00");
  const [event, setEvent] = useState<SunEvent>(rule?.at.kind === "sun" ? rule.at.event : "sunset");
  const [offset, setOffset] = useState(rule?.at.kind === "sun" ? rule.at.offset : 0);
  const [playlistId, setPlaylistId] = useState(rule?.playlistId ?? snap.playlists[0]!.id);
  const minutes = parseTime(time);
  const at: RuleTime | null = kind === "time" ? (minutes === null ? null : { kind: "time", minutes }) : { kind: "sun", event, offset };

  const save = () => {
    if (!at || !days.length) return;
    onClose();
    void run(api.saveRule({ id: rule?.id, days, at, playlistId, enabled: rule?.enabled ?? true }), rule ? "Rule updated" : "Rule added");
  };

  return (
    <Modal title={rule ? "Edit rule" : "New rule"} onClose={onClose} testId="rule-editor">
      <div className="stack" style={{ gap: 18 }}>
        <Field label="Play">
          <select className="input" value={playlistId} onChange={(e) => setPlaylistId(e.target.value)} data-testid="rule-playlist">
            {snap.playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Starting">
          <Seg
            value={kind}
            onChange={setKind}
            testId="rule-kind"
            options={[
              { value: "time", label: "At a time" },
              { value: "sun", label: "With the sun" },
            ]}
          />
        </Field>
        {kind === "time" ? (
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} data-testid="rule-time" aria-label="Time" />
        ) : (
          <div className="row">
            <select className="input" value={offset} onChange={(e) => setOffset(Number(e.target.value))} aria-label="Offset" data-testid="rule-offset">
              {[-120, -60, -30, -15, 0, 15, 30, 60, 120].map((o) => (
                <option key={o} value={o}>
                  {o === 0 ? "At" : `${Math.abs(o) >= 60 ? `${Math.abs(o) / 60} h` : `${Math.abs(o)} min`} ${o < 0 ? "before" : "after"}`}
                </option>
              ))}
            </select>
            <select className="input grow" value={event} onChange={(e) => setEvent(e.target.value as SunEvent)} aria-label="Sun event" data-testid="rule-event">
              <option value="dawn">dawn (first light)</option>
              <option value="sunrise">sunrise</option>
              <option value="sunset">sunset</option>
              <option value="dusk">dusk (last light)</option>
            </select>
          </div>
        )}
        <Field label="On">
          <div className="row wrap">
            <div className="days" role="group" aria-label="Days">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <button key={d} className={days.includes(d) ? "on" : ""} aria-pressed={days.includes(d)} onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])} data-testid={`day-${d}`}>
                  {DAY_SHORT[d]!.slice(0, 2)}
                </button>
              ))}
            </div>
            <button className="chip" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>
              Every day
            </button>
            <button className="chip" onClick={() => setDays([1, 2, 3, 4, 5])}>
              Weekdays
            </button>
            <button className="chip" onClick={() => setDays([0, 6])}>
              Weekends
            </button>
          </div>
        </Field>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <span className="small grow">{at && days.length ? `${describeTime(at)}, ${describeDays(days).toLowerCase()}` : !days.length ? "Pick at least one day" : "Enter a time like 07:30"}</span>
          <button className="btn primary" onClick={save} disabled={!at || !days.length} data-testid="rule-save">
            {rule ? "Save" : "Add rule"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
