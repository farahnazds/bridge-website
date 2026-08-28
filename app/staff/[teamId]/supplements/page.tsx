import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getStaffTeamContext } from "@/lib/staffTeamContext";
import { canWriteClubData } from "@/lib/auth";
import { CARD } from "@/lib/ui";
import { todayIso } from "@/lib/supplementProtocols";
import { loadAthleteClinicalContext, loadSupplementLibrary } from "@/lib/supplementPlanSafety";
import { loadTrainingLoadDays } from "@/lib/nutritionPlanData";
import SupplementsClient, { type AthleteProtocols, type CatalogueProductLite, type ProtocolRow } from "./SupplementsClient";

export const metadata: Metadata = { title: "Supplement Protocols — Bridgetx" };

type RosterAthlete = { id: string; first_name: string; last_name: string; code: string };

// Standing oversight of every supplement protocol on the team.
//
// The Nutrition Planner (./planner — a sub-route of this page since the
// planner/report split) is where protocols come FROM — AI suggestion, review,
// confirm. This page is what you use afterwards: scan the roster, correct a
// dose, shorten or extend a range, end something early, or add one by hand.
//
// Same table, same helpers, same safety check. An edit made here reaches Daily
// Check-In and My Protocol exactly as a planner confirmation does, because
// there is only one source of truth and both write to it.

export default async function SupplementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  /** ?athlete=<id> filters to one athlete — the same contract the Reports page
   *  and the planner honour, so an Athlete Profile deep link behaves the same
   *  wherever it points. */
  searchParams: Promise<{ athlete?: string }>;
}) {
  const { teamId } = await params;
  const { athlete: athleteParam } = await searchParams;
  const supabase = await createClient();
  const context = await getStaffTeamContext(teamId);
  const canEdit = canWriteClubData(context?.profile ?? null);

  const { data: rosterRows } = await supabase
    .from("athlete_teams")
    .select("athletes(id, first_name, last_name, code)")
    .eq("team_id", teamId);

  const athletes = ((rosterRows ?? []) as unknown as { athletes: RosterAthlete | null }[])
    .map((r) => r.athletes)
    .filter((a): a is RosterAthlete => a !== null)
    .sort((a, b) => a.last_name.localeCompare(b.last_name));
  const athleteIds = athletes.map((a) => a.id);

  // Every protocol for the roster in one query, then split per athlete in
  // TypeScript. RLS scopes it — an athlete this caller cannot see contributes
  // no rows and simply does not appear.
  const { data: protocolRows } = athleteIds.length
    ? await supabase
        .from("supplement_protocols")
        .select(
          "id, athlete_id, supplement_name, supplement_library_id, product_id, dose, timing, rationale, start_date, end_date, prescribed_by, updated_at"
        )
        .in("athlete_id", athleteIds)
        .order("start_date", { ascending: false })
    : { data: [] };

  // Computed server-side and passed down, so every phase decision on this page
  // is made against one date. A client-side today would drift across a UTC
  // midnight and could label a row differently from the row above it.
  const today = todayIso();
  // The agenda's window: today through six days out. UTC arithmetic on the
  // same `today` string, so the window can never straddle a different date
  // than the phase decisions.
  const agendaEnd = new Date(Date.parse(today) + 6 * 86400000).toISOString().slice(0, 10);

  const [contexts, library, productsRes, brandsRes, allergiesRes, loadDaysByAthlete] = await Promise.all([
    loadAthleteClinicalContext(athleteIds),
    loadSupplementLibrary(),
    // The certified catalogue (migration 042): every product carrying a
    // clinical link is an alternative for protocols on that entity. Global
    // catalogue tables, authenticated-read under RLS.
    supabase
      .from("products")
      .select("id, name, brand_id, supplement_library_id, informed_sport, nsf_certified, allergens, vegan, default_dosing, default_timing")
      .not("supplement_library_id", "is", null),
    supabase.from("brands").select("id, name"),
    // The full allergy vocabulary, so a product chip can name an allergen the
    // ATHLETE HASN'T declared. The athlete's own codeLabels only cover their
    // declarations — without this, an undeclared allergen rendered as its raw
    // code ("Contains milk_dairy").
    supabase.from("allergies").select("code, label"),
    // Training-load context for the agenda's day rails — the same loader the
    // planner uses, so both surfaces resolve athlete-over-team scope the same
    // way. A day with no plan entry stays null and the agenda says so
    // honestly ("No plan entry"), never inventing a rest day.
    loadTrainingLoadDays(teamId, athleteIds, today, agendaEnd),
  ]);

  // Maps don't cross the server→client boundary; flatten to the fields the
  // agenda rail actually shows.
  const agendaLoads: Record<string, { date: string; intensity: string | null; sessionType: string | null; rpe: number | null }[]> = {};
  for (const [athleteId, days] of loadDaysByAthlete) {
    agendaLoads[athleteId] = days.map((d) => ({
      date: d.date,
      intensity: d.load?.intensity ?? null,
      sessionType: d.load?.sessionType ?? null,
      rpe: d.load?.rpe ?? null,
    }));
  }

  const brandName = new Map(((brandsRes.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const products: CatalogueProductLite[] = ((productsRes.data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    brand: brandName.get(p.brand_id as string) ?? "—",
    supplementLibraryId: p.supplement_library_id as string,
    informedSport: Boolean(p.informed_sport),
    nsfCertified: Boolean(p.nsf_certified),
    allergens: (p.allergens as string[] | null) ?? [],
    vegan: Boolean(p.vegan),
    defaultDosing: (p.default_dosing as string | null) ?? null,
    defaultTiming: (p.default_timing as string | null) ?? null,
  }));
  const allergenLabels: Record<string, string> = Object.fromEntries(
    ((allergiesRes.data ?? []) as { code: string; label: string }[]).map((a) => [a.code, a.label])
  );

  const byAthlete = new Map<string, ProtocolRow[]>();
  for (const r of protocolRows ?? []) {
    const row: ProtocolRow = {
      id: r.id as string,
      athleteId: r.athlete_id as string,
      supplementName: r.supplement_name as string,
      supplementLibraryId: (r.supplement_library_id as string | null) ?? null,
      productId: (r.product_id as string | null) ?? null,
      dose: r.dose as string,
      timing: r.timing as string,
      rationale: (r.rationale as string | null) ?? "",
      startDate: r.start_date as string,
      endDate: (r.end_date as string | null) ?? null,
    };
    const list = byAthlete.get(row.athleteId);
    if (list) list.push(row);
    else byAthlete.set(row.athleteId, [row]);
  }

  const data: AthleteProtocols[] = athletes.map((a) => {
    const clinical = contexts.get(a.id);
    return {
      athleteId: a.id,
      name: `${a.first_name} ${a.last_name}`,
      code: a.code,
      flags: {
        allergies: clinical?.allergies ?? [],
        intolerances: clinical?.intolerances ?? [],
        conditions: clinical?.conditions ?? [],
        redSFlag: clinical?.redSFlag ?? false,
        ironFlag: clinical?.ironFlag ?? false,
      },
      // The full clinical context, for the Add form's safety banner and its
      // real-time mismatch check — which runs checkPlanItems() in the browser,
      // the same function the server gate and the planner run. Nothing here is
      // data the practitioner can't already see on this page.
      clinical: clinical ?? null,
      protocols: byAthlete.get(a.id) ?? [],
    };
  });

  const preselected = athleteParam && athleteIds.includes(athleteParam) ? athleteParam : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Supplement Protocols
        </h1>
        <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--text-muted)" }}>
          What every athlete on this team is currently on, and what is scheduled to start. Edit a
          dose, timing or date range here; protocols are normally created through the{" "}
          <Link
            href={`/staff/${teamId}/supplements/planner`}
            className="font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--brand-blue)" }}
          >
            Nutrition Planner
          </Link>
          . Changes reach the athlete&apos;s check-in and My Protocol immediately.
        </p>
      </div>

      {athletes.length > 0 ? (
        <SupplementsClient
          teamId={teamId}
          today={today}
          data={data}
          library={library}
          products={products}
          allergenLabels={allergenLabels}
          agendaLoads={agendaLoads}
          canEdit={canEdit}
          preselectedAthleteId={preselected}
        />
      ) : (
        <div className={`${CARD} p-6`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <p style={{ color: "var(--text-muted)" }}>
            No athletes on this team yet — add one to the roster first.
          </p>
        </div>
      )}
    </div>
  );
}
