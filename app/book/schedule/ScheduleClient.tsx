"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { NOTICE } from "@/lib/ui";
import type { DayAvailability } from "@/lib/booking";
import { requestBooking, type BookingState } from "./../actions";

// Step 2's calendar and slot picker, from the "Bridgetx Book a Meeting"
// design in real tokens. Purely presentational over the availability lib/
// booking.ts provides — the placeholder-vs-real distinction lives entirely
// in that module. Confirming records a REQUEST and says so honestly: no
// calendar event exists until the Google integration lands, so the success
// copy promises an email confirmation, not a booked meeting.

const MONO = "var(--font-mono), monospace";
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEK_HEADER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const initialState: BookingState = { error: null, requested: false, summary: null };

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
  tzLabel,
}: {
  leadId: string | null;
  availability: DayAvailability[];
  tzLabel: string;
}) {
  const [state, action] = useActionState(requestBooking, initialState);
  const [monthIndex, setMonthIndex] = useState(0);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);

  const slotsByDate = useMemo(() => new Map(availability.map((d) => [d.date, d.slots])), [availability]);
  const months = useMemo(
    () => [...new Set(availability.map((d) => d.date.slice(0, 7)))].sort(),
    [availability]
  );

  const month = months[Math.min(monthIndex, months.length - 1)] ?? new Date().toISOString().slice(0, 7);
  const [yearNum, monthNum] = month.split("-").map(Number);
  const monthLabel = `${MONTH_NAMES[monthNum - 1]} ${yearNum}`;

  // Monday-first cells: leading blanks, then one cell per day of the month.
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

  const daySlots = day ? slotsByDate.get(day) ?? [] : [];
  const dayLabel = day
    ? `${DAY_NAMES[new Date(Date.parse(day)).getUTCDay()]}, ${MONTH_NAMES[Number(day.slice(5, 7)) - 1].slice(0, 3)} ${Number(day.slice(8, 10))}`
    : "";
  const slotLabel = day && slot ? `${dayLabel} at ${slot} (GMT+4)` : "";
  const slotIso = day && slot ? `${day}T${slot}:00+04:00` : "";

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
                  { glyph: "‹", disabled: monthIndex === 0, go: () => setMonthIndex((i) => Math.max(0, i - 1)) },
                  { glyph: "›", disabled: monthIndex >= months.length - 1, go: () => setMonthIndex((i) => Math.min(months.length - 1, i + 1)) },
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
                    onClick={() => { setDay(c.date); setSlot(null); }}
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
                <span className="text-[15px] font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
                  Request received
                </span>
                <span className="text-[13.5px]" style={{ lineHeight: 1.6, color: "var(--text-muted)", textWrap: "pretty" }}>
                  {state.summary} · 15 min · video call
                </span>
                <span className="text-[12.5px]" style={{ lineHeight: 1.6, color: "var(--text-muted)", textWrap: "pretty" }}>
                  We&apos;ll confirm this time by email shortly — nothing is locked in until you hear from us.
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
                  <span className="text-[10.5px] uppercase" style={{ fontFamily: MONO, letterSpacing: ".12em", color: "color-mix(in srgb, var(--text) 34%, transparent)" }}>
                    {tzLabel}
                  </span>
                </div>
                <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(104px, 1fr))" }}>
                  {daySlots.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSlot(t)}
                      className="flex items-center justify-center rounded-[9px] px-2 py-3 text-[13px] transition-colors duration-200 ease-out"
                      style={
                        slot === t
                          ? { fontFamily: MONO, color: "#fff", background: "var(--brand-gradient-action)" }
                          : {
                              fontFamily: MONO,
                              color: "var(--text)",
                              border: "1px solid color-mix(in srgb, var(--text) 12%, transparent)",
                              backgroundColor: "color-mix(in srgb, var(--text) 3%, transparent)",
                            }
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {slot && (
                  <form action={action} className="mt-1.5 flex flex-col gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                    <input type="hidden" name="lead_id" value={leadId ?? ""} />
                    <input type="hidden" name="slot_iso" value={slotIso} />
                    <input type="hidden" name="slot_label" value={slotLabel} />
                    <span className="text-[13.5px]" style={{ lineHeight: 1.6, color: "var(--text-muted)", textWrap: "pretty" }}>
                      {dayLabel} at {slot} · 15 min · video call
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
