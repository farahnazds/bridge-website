"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { NOTICE } from "@/lib/ui";
import type { AvailabilityPayload } from "@/lib/booking";
import { requestBooking, type BookingState } from "./../actions";

// Step 2's calendar and slot picker.
//
// TIMEZONE MODEL — the thing to understand before editing anything here.
//
// The server sends ABSOLUTE INSTANTS, not "HH:MM" strings. Which moments are
// offered was decided on the server in the HOST's terms (the owner's working
// hours in Dubai). This component decides only how those moments are LABELLED,
// in whatever zone the visitor is actually in. Nothing here can change which
// moment gets booked — the form submits the instant verbatim.
//
// That is why every date the calendar grid shows is derived from the instants
// rather than from a server-supplied date string. For a visitor in Los
// Angeles, 09:00 Dubai on the 26th is 22:00 on the 25th — a slot that belongs
// under a DIFFERENT calendar day than the one the host filed it under. Group
// by the server's dates and those visitors see slots on the wrong day.
//
// HYDRATION: the first client render must match the server's HTML, and the
// server cannot know the visitor's zone. That is precisely what
// useSyncExternalStore's server/client snapshot split is for — the server
// snapshot is the HOST zone, the client snapshot is the detected one, and
// React reconciles the difference itself. Doing this with useState + useEffect
// instead would work but costs a setState cascade on every mount, which the
// React Compiler lint correctly rejects.

const MONO = "var(--font-mono), monospace";
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEK_HEADER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const initialState: BookingState = { error: null, requested: false, summary: null, confirmed: false };

/** A short, sane fallback for the picker when Intl.supportedValuesOf is
 *  unavailable. Covers the markets Bridgetx actually sells into plus the
 *  common visitor origins; the detected zone is always prepended so a visitor
 *  outside this list still sees their own. */
const FALLBACK_ZONES = [
  "Asia/Dubai", "Asia/Riyadh", "Asia/Qatar", "Asia/Kuwait", "Asia/Karachi", "Asia/Kolkata",
  "Europe/London", "Europe/Dublin", "Europe/Lisbon", "Europe/Madrid", "Europe/Paris", "Europe/Berlin",
  "Europe/Rome", "Europe/Amsterdam", "Europe/Stockholm", "Europe/Istanbul", "Europe/Moscow",
  "Africa/Cairo", "Africa/Lagos", "Africa/Johannesburg", "Africa/Nairobi",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Toronto", "America/Sao_Paulo", "America/Mexico_City",
  "Asia/Singapore", "Asia/Hong_Kong", "Asia/Tokyo", "Asia/Shanghai", "Asia/Seoul", "Asia/Bangkok",
  "Australia/Perth", "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane",
  "Pacific/Auckland", "UTC",
];

/** Cached at module scope because useSyncExternalStore's getSnapshot must
 *  return a stable value — recomputing it per call is what makes React warn
 *  about an infinite render loop. */
let cachedDetected: string | null = null;

function detectTimeZone(fallback: string): string {
  if (cachedDetected !== null) return cachedDetected;
  try {
    cachedDetected = Intl.DateTimeFormat().resolvedOptions().timeZone || fallback;
  } catch {
    cachedDetected = fallback;
  }
  return cachedDetected;
}

/** The zone never changes underneath us, so there is nothing to subscribe to —
 *  useSyncExternalStore is used purely for its server/client snapshot split. */
const noopSubscribe = () => () => {};

function allZones(detected: string): string[] {
  let list: string[];
  try {
    // Available in every current browser; the fallback is for old ones.
    list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? FALLBACK_ZONES;
  } catch {
    list = FALLBACK_ZONES;
  }
  return list.includes(detected) ? list : [detected, ...list];
}

/**
 * The civil date (YYYY-MM-DD) an instant falls on IN A GIVEN ZONE.
 * Assembled from named Intl parts rather than by slicing a formatted string,
 * so it cannot be broken by locale ordering (en-GB would give 26/08/2026).
 */
function ymdInZone(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}`;
}

/** "09:00" in the given zone, 24h. */
function hhmmInZone(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}

/** "GMT+4" — read from Intl so it is right for any zone, and right across a
 *  DST boundary for zones that observe one. */
function offsetLabel(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "shortOffset" })
    .formatToParts(new Date(iso));
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-[10px] px-5 py-3 text-center text-[14.5px] font-semibold text-white transition-[filter] duration-200 ease-out hover:brightness-110 disabled:opacity-60"
      style={{ backgroundImage: "var(--brand-gradient-action)" }}
    >
      {pending ? "Sending…" : "Confirm booking"}
    </button>
  );
}

export default function ScheduleClient({
  leadId,
  availability,
}: {
  leadId: string | null;
  availability: AvailabilityPayload;
}) {
  const [state, action] = useActionState(requestBooking, initialState);
  const [monthIndex, setMonthIndex] = useState(0);
  const [daySel, setDay] = useState<string | null>(null);
  /** The SELECTED INSTANT, not a wall-clock string. */
  const [slotIsoSel, setSlotIso] = useState<string | null>(null);

  // The server cannot know the visitor's zone, so the server snapshot is the
  // HOST zone and the client snapshot is the detected one. This is exactly the
  // problem useSyncExternalStore's two-snapshot split exists for — React
  // reconciles it without a hydration mismatch and without a setState-in-effect
  // cascade. An explicit pick from the dropdown overrides both.
  const detectedTz = useSyncExternalStore(
    noopSubscribe,
    () => detectTimeZone(availability.hostTimeZone),
    () => availability.hostTimeZone
  );
  const [tzOverride, setTzOverride] = useState<string | null>(null);
  const tz = tzOverride ?? detectedTz;

  const zones = useMemo(() => allZones(tz), [tz]);

  // Slots grouped by the visitor's civil date. Rebuilt whenever the zone
  // changes, which is the whole point: changing the picker regroups the
  // calendar, it does not merely relabel it.
  const slotsByDate = useMemo(() => {
    const map = new Map<string, { iso: string; label: string }[]>();
    for (const iso of availability.slots) {
      const key = ymdInZone(iso, tz);
      const list = map.get(key) ?? [];
      list.push({ iso, label: hhmmInZone(iso, tz) });
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.iso.localeCompare(b.iso));
    return map;
  }, [availability.slots, tz]);

  const months = useMemo(
    () => [...new Set([...slotsByDate.keys()].map((d) => d.slice(0, 7)))].sort(),
    [slotsByDate]
  );

  // A zone change can move the earliest slot into a different month, which
  // would leave monthIndex pointing past the end.
  const safeMonthIndex = Math.min(monthIndex, Math.max(0, months.length - 1));
  const month = months[safeMonthIndex] ?? new Date().toISOString().slice(0, 7);
  const [yearNum, monthNum] = month.split("-").map(Number);
  const monthLabel = `${MONTH_NAMES[monthNum - 1]} ${yearNum}`;

  // Monday-first cells. Pure CIVIL-calendar arithmetic on a date that is
  // already expressed in the visitor's zone, so Date.UTC here is a calendar
  // helper and carries no timezone meaning of its own.
  const cells = useMemo(() => {
    const list: { date: string; n: number; open: boolean }[] = [];
    const firstDow = (new Date(Date.UTC(yearNum, monthNum - 1, 1)).getUTCDay() + 6) % 7;
    const total = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate();
    for (let i = 0; i < firstDow; i++) list.push({ date: `blank-${i}`, n: 0, open: false });
    for (let d = 1; d <= total; d++) {
      const date = `${month}-${String(d).padStart(2, "0")}`;
      list.push({ date, n: d, open: (slotsByDate.get(date)?.length ?? 0) > 0 });
    }
    return list;
  }, [month, yearNum, monthNum, slotsByDate]);

  // DERIVED, not an effect: a zone change can leave the selected day with no
  // slots, and the fix is simply to stop treating it as selected. Computing
  // that during render avoids a setState cascade and an intermediate frame
  // showing an empty column under a stale heading.
  const day = daySel && slotsByDate.has(daySel) ? daySel : null;
  const daySlots = day ? slotsByDate.get(day) ?? [] : [];
  const dayLabel = day
    ? `${DAY_NAMES[new Date(`${day}T00:00:00Z`).getUTCDay()]}, ${MONTH_NAMES[Number(day.slice(5, 7)) - 1].slice(0, 3)} ${Number(day.slice(8, 10))}`
    : "";
  const tzLabel = day && daySlots.length
    ? `Times in ${tz.replace(/_/g, " ")} (${offsetLabel(daySlots[0].iso, tz)})`
    : `Times in ${tz.replace(/_/g, " ")}`;
  // Likewise: an instant selected before a zone change stays valid only if it
  // is still among the offered slots for the (possibly regrouped) day.
  const slotIso = slotIsoSel && daySlots.some((s) => s.iso === slotIsoSel) ? slotIsoSel : null;
  const selectedLabel = slotIso ? hhmmInZone(slotIso, tz) : null;
  /** Shown only when the visitor is somewhere other than the host. */
  const hostHint =
    slotIso && tz !== availability.hostTimeZone
      ? `${hhmmInZone(slotIso, availability.hostTimeZone)} ${offsetLabel(slotIso, availability.hostTimeZone)} in Dubai`
      : null;

  return (
    <>
      <div className="flex max-w-[640px] flex-col items-center gap-4 text-center">
        <span className="text-[11px] uppercase" style={{ fontFamily: MONO, letterSpacing: ".18em", color: "var(--brand-blue)" }}>
          Book a meeting
        </span>
        <h1
          className="m-0 text-[clamp(36px,5.4vw,52px)] font-semibold"
          style={{ fontFamily: "var(--font-heading)", lineHeight: 1.05, letterSpacing: "-.036em", color: "var(--text)", textWrap: "pretty" }}
        >
          Let&apos;s talk about your club.
        </h1>
        <p className="m-0 text-[17.5px]" style={{ lineHeight: 1.65, color: "var(--text-muted)", textWrap: "pretty" }}>
          Pick a time that suits you and we&apos;ll walk through Bridgetx with your sports and your squad in mind.
          No pressure, no slide deck — just a short call.
        </p>
      </div>

      {!leadId && (
        <p className={NOTICE} style={{ borderColor: "var(--warning)", color: "var(--text)", backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)" }}>
          Start with the one-minute intake first so we know who&apos;s booking —{" "}
          <Link href="/book" className="font-medium underline underline-offset-2" style={{ color: "var(--brand-blue)" }}>
            go to step 1
          </Link>
          .
        </p>
      )}

      <div
        className="w-full max-w-[940px] overflow-hidden rounded-[18px] border"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-4 border-b px-7 py-5"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-raised)" }}
        >
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full" style={{ background: "linear-gradient(135deg, var(--brand-teal), var(--brand-sky))" }} />
            <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>15-minute intro call</span>
          </div>
          <span className="text-[11px] uppercase" style={{ fontFamily: MONO, letterSpacing: ".14em", color: "var(--text-muted)" }}>
            Video call · link sent on booking
          </span>
        </div>

        <div className="flex flex-wrap">
          {/* ------------------------------ calendar ------------------------ */}
          <div className="box-border flex flex-col gap-4 border-r px-7 py-7" style={{ flex: "1 1 460px", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[19px] font-semibold" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-.018em", color: "var(--text)" }}>
                {monthLabel}
              </span>
              <div className="flex gap-2">
                {[
                  { glyph: "‹", disabled: safeMonthIndex === 0, go: () => setMonthIndex(Math.max(0, safeMonthIndex - 1)) },
                  { glyph: "›", disabled: safeMonthIndex >= months.length - 1, go: () => setMonthIndex(Math.min(months.length - 1, safeMonthIndex + 1)) },
                ].map((b) => (
                  <button
                    key={b.glyph}
                    type="button"
                    onClick={b.go}
                    disabled={b.disabled}
                    aria-label={b.glyph === "‹" ? "Previous month" : "Next month"}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition-colors duration-200 ease-out hover:border-white/30 hover:bg-white/5 disabled:opacity-40"
                    style={{ borderColor: "color-mix(in srgb, var(--text) 12%, transparent)", color: "var(--text-muted)" }}
                  >
                    {b.glyph}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {WEEK_HEADER.map((w) => (
                <span key={w} className="text-center text-[10px]" style={{ fontFamily: MONO, letterSpacing: ".1em", color: "color-mix(in srgb, var(--text) 34%, transparent)" }}>
                  {w}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((c) =>
                c.n === 0 ? (
                  <span key={c.date} />
                ) : (
                  <button
                    key={c.date}
                    type="button"
                    disabled={!c.open}
                    onClick={() => { setDay(c.date); setSlotIso(null); }}
                    className="mx-auto flex h-[46px] w-full max-w-[54px] items-center justify-center rounded-[10px] text-sm transition-all duration-200 ease-out"
                    style={
                      day === c.date
                        ? { fontFamily: MONO, color: "#fff", background: "var(--brand-gradient-action)" }
                        : c.open
                          ? {
                              fontFamily: MONO,
                              color: "var(--text)",
                              border: "1px solid color-mix(in srgb, var(--brand-teal) 30%, transparent)",
                              backgroundColor: "color-mix(in srgb, var(--brand-teal) 7%, transparent)",
                              cursor: "pointer",
                            }
                          : { fontFamily: MONO, color: "color-mix(in srgb, var(--text) 20%, transparent)" }
                    }
                  >
                    {c.n}
                  </button>
                )
              )}
            </div>

            <div className="flex items-center gap-4 pt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              <span className="flex items-center gap-2">
                <span className="h-[11px] w-[11px] rounded" style={{ border: "1px solid color-mix(in srgb, var(--brand-teal) 50%, transparent)", backgroundColor: "color-mix(in srgb, var(--brand-teal) 12%, transparent)" }} />
                Available
              </span>
              <span className="flex items-center gap-2">
                <span className="h-[11px] w-[11px] rounded" style={{ backgroundColor: "color-mix(in srgb, var(--text) 7%, transparent)" }} />
                Fully booked
              </span>
            </div>
          </div>

          {/* ------------------------------ slots --------------------------- */}
          <div className="box-border flex flex-col gap-4 px-7 py-7" style={{ flex: "1 1 300px" }}>
            {state.requested ? (
              <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-3.5 px-2 text-center">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm"
                  style={{ color: "var(--bg)", background: "linear-gradient(135deg, var(--brand-teal), var(--brand-sky))" }}
                >
                  ✓
                </span>
                {/* Two outcomes, worded honestly. `confirmed` is true only
                    when a real calendar event now exists; when the calendar is
                    unconfigured or Google was unreachable, lib/booking.ts
                    records the slot as a REQUEST and this falls back to the
                    original promise-nothing copy. Never tell a visitor a
                    meeting is booked on the strength of a database row. */}
                <span className="text-[15px] font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
                  {state.confirmed ? "Booking confirmed" : "Request received"}
                </span>
                <span className="text-[13.5px]" style={{ lineHeight: 1.6, color: "var(--text-muted)", textWrap: "pretty" }}>
                  {state.summary} · {availability.meetingMinutes} min · video call
                </span>
                <span className="text-[12.5px]" style={{ lineHeight: 1.6, color: "var(--text-muted)", textWrap: "pretty" }}>
                  {state.confirmed
                    ? "This time is now held in our calendar, and a calendar invitation is on its way to your inbox."
                    : "We’ll confirm this time by email shortly — nothing is locked in until you hear from us."}
                </span>
              </div>
            ) : !day ? (
              <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-3 px-2 text-center">
                <span
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border text-[13px]"
                  style={{ fontFamily: MONO, borderColor: "color-mix(in srgb, var(--text) 12%, transparent)", color: "var(--text-muted)" }}
                >
                  →
                </span>
                <span className="text-[14.5px]" style={{ lineHeight: 1.6, color: "var(--text-muted)", textWrap: "pretty" }}>
                  Pick a day to see open times.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[17px] font-semibold" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-.016em", color: "var(--text)" }}>
                    {dayLabel}
                  </span>
                  {/* The zone is a real control, not a caption. Detection is
                      right the overwhelming majority of the time but is wrong
                      often enough — VPNs, corporate images, a laptop that
                      never left home — that a visitor must be able to correct
                      it. Changing it REGROUPS the calendar, because a slot can
                      legitimately belong to a different date in another zone. */}
                  <label className="flex flex-wrap items-center gap-2 text-[10.5px] uppercase" style={{ fontFamily: MONO, letterSpacing: ".12em", color: "color-mix(in srgb, var(--text) 34%, transparent)" }}>
                    <span>{tzLabel}</span>
                    <select
                      value={tz}
                      onChange={(e) => setTzOverride(e.target.value)}
                      aria-label="Show times in this timezone"
                      className="rounded-[7px] border px-2 py-1 text-[11px] normal-case"
                      style={{
                        fontFamily: MONO,
                        letterSpacing: ".02em",
                        color: "var(--text)",
                        borderColor: "color-mix(in srgb, var(--text) 12%, transparent)",
                        backgroundColor: "var(--surface-raised)",
                        maxWidth: "100%",
                      }}
                    >
                      {zones.map((z) => (
                        <option key={z} value={z}>
                          {z.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(104px, 1fr))" }}>
                  {daySlots.map((t) => (
                    <button
                      key={t.iso}
                      type="button"
                      onClick={() => setSlotIso(t.iso)}
                      className="flex items-center justify-center rounded-[9px] px-2 py-3 text-[13px] transition-colors duration-200 ease-out"
                      style={
                        slotIso === t.iso
                          ? { fontFamily: MONO, color: "#fff", background: "var(--brand-gradient-action)" }
                          : {
                              fontFamily: MONO,
                              color: "var(--text)",
                              border: "1px solid color-mix(in srgb, var(--text) 12%, transparent)",
                              backgroundColor: "color-mix(in srgb, var(--text) 3%, transparent)",
                            }
                      }
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {slotIso && (
                  <form action={action} className="mt-1.5 flex flex-col gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                    <input type="hidden" name="lead_id" value={leadId ?? ""} />
                    <input type="hidden" name="slot_iso" value={slotIso} />
                    {/* A DISPLAY hint only. lib/booking.ts validates it through
                        safeTimeZone(), and because slot_iso is an absolute
                        instant a wrong or spoofed zone can change only how the
                        confirmation reads back — never the moment reserved.
                        slot_label is gone: the server now derives both the
                        visitor's and the owner's label from the instant. */}
                    <input type="hidden" name="visitor_tz" value={tz} />
                    <span className="text-[13.5px]" style={{ lineHeight: 1.6, color: "var(--text-muted)", textWrap: "pretty" }}>
                      {dayLabel} at {selectedLabel} · {availability.meetingMinutes} min · video call
                      {hostHint ? (
                        <>
                          <br />
                          <span style={{ color: "color-mix(in srgb, var(--text) 40%, transparent)" }}>{hostHint}</span>
                        </>
                      ) : null}
                    </span>
                    {state.error && (
                      <p role="alert" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)", backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)" }}>
                        {state.error}
                      </p>
                    )}
                    <ConfirmButton />
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid w-full max-w-[940px] gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {[
          ["linear-gradient(90deg, var(--brand-teal), var(--brand-sky))", "A real report walked through end to end, not a feature tour."],
          ["linear-gradient(90deg, var(--brand-sky), var(--brand-blue-deep))", "How benchmarks work for your sports, age groups, and squad size."],
          ["linear-gradient(90deg, var(--brand-blue-deep), var(--brand-blue))", "What onboarding your athletes and practitioners actually involves."],
        ].map(([gradient, text]) => (
          <div key={text} className="flex flex-col gap-2.5">
            <span className="h-0.5 w-[26px] rounded-[1px]" style={{ background: gradient }} />
            <span className="text-[15.5px]" style={{ lineHeight: 1.65, color: "color-mix(in srgb, var(--text) 72%, transparent)", textWrap: "pretty" }}>
              {text}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
