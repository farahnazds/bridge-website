import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import CheckInWizard, { type DayCell, type ExistingCheckin } from "./CheckInWizard";
import {
  CHECKIN_STRIP_DAYS, isWithinCheckinWindow, parseSupplements, recentDates, toDateStr,
} from "@/lib/checkin";
import { CARD } from "@/lib/ui";

export const metadata: Metadata = { title: "Daily Check-In — Bridgetx" };

// The athlete's Daily Check-In.
//
// WHAT CHANGED FROM THE OLD FLOW, and why it is a product change rather than a
// restyle: the previous page offered yesterday-then-today only, and its own
// comment said older days were "implicitly treated as skipped … not
// retroactively enterable". The date strip makes the last 7 days reachable and
// missed ones fillable, so that rule is gone — replaced by a real bound in
// migration 034, which permits INSERT and UPDATE only for a date within 7 days
// of today. The window is now the database's, not a consequence of which form
// this page happened to render.
//
// BACKFILL PROPAGATION. Every downstream figure derives from `checkins` at
// request time — the Home streak walks back from today over rows it reads on
// each render, and My Compliance recomputes its rate and longest run the same
// way — so a backfilled day is reflected everywhere without any of them
// knowing this page exists. The action revalidates those two routes so a
// freshly-filled gap is visible immediately rather than on next navigation.
// Verified live rather than assumed; see the note in actions.ts.

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ athleteId: string }>;
  /** Which day the strip has selected. Absent means today. */
  searchParams: Promise<{ date?: string }>;
}) {
  const { athleteId } = await params;
  const { date: dateParam } = await searchParams;
  const supabase = await createClient();

  const strip = recentDates(CHECKIN_STRIP_DAYS);
  const todayStr = toDateStr(new Date());

  // Only a date the strip actually offers is honoured. A hand-edited ?date=
  // outside the window falls back to today rather than rendering a form whose
  // submit RLS would refuse.
  const activeDate = dateParam && strip.includes(dateParam) ? dateParam : todayStr;

  const { data: rows } = await supabase
    .from("checkins")
    .select("date, supplements_taken, nutrition_score, hydration_score, energy_level, sleep_score, notes, compliance_score")
    .eq("athlete_id", athleteId)
    .gte("date", strip[0]);

  const byDate = new Map((rows ?? []).map((r) => [r.date as string, r]));

  const days: DayCell[] = strip.map((date) => {
    const d = new Date(date);
    const logged = byDate.has(date);
    return {
      date,
      weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
      dayNum: String(d.getDate()),
      status: logged ? "completed" : date === todayStr ? "today-open" : "missed",
      // Mirrors within_checkin_window() from migration 034. Every day in the
      // strip is inside it by construction; the flag exists so the component
      // does not have to re-derive the rule, and so it stays correct if the
      // strip length and the window ever diverge.
      editable: isWithinCheckinWindow(date),
    };
  });

  const row = byDate.get(activeDate);
  const existing: ExistingCheckin | null = row
    ? {
        date: activeDate,
        supplements: parseSupplements(row.supplements_taken as string | null),
        nutritionLabel: row.nutrition_score as string | null,
        hydration: row.hydration_score as number | null,
        energy: row.energy_level as number | null,
        sleep: row.sleep_score as number | null,
        notes: row.notes as string | null,
        compliance: row.compliance_score as number | null,
      }
    : null;

  // Step 1's list is the athlete's ACTIVE protocol — the same rows My Protocol
  // shows, read through the same "athlete reads own protocol" policy. An ended
  // prescription (end_date set) is excluded: it is history, not something to
  // tick off today.
  const { data: protocolRows } = await supabase
    .from("supplement_protocols")
    .select("supplement_name, end_date")
    .eq("athlete_id", athleteId)
    .is("end_date", null)
    .order("start_date", { ascending: false });
  const protocolSupplements = [...new Set((protocolRows ?? []).map((p) => p.supplement_name as string))];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Daily check-in
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          A minute a day. Tap a date to log it or look back.
        </p>
      </div>

      <div className={`max-w-2xl ${CARD} p-6 shadow-sm`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
        <CheckInWizard
          athleteId={athleteId}
          days={days}
          activeDate={activeDate}
          protocolSupplements={protocolSupplements}
          existing={existing}
          dateLabel={activeDate === todayStr ? "Today" : formatDate(activeDate)}
        />
      </div>
    </div>
  );
}
