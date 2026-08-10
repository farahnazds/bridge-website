import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import InjuriesClient, { type InjuryRecord } from "./InjuriesClient";
import { CARD, NOTICE } from "@/lib/ui";

// Formats an embedded profile row into a display name. The provider name
// used to require a second round trip (fetch ids, then fetch profiles);
// it now arrives on the parent query via a PostgREST FK embed.
function personName(p: { first_name: string | null; last_name: string | null } | null): string {
  if (!p) return "—";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}

export const metadata: Metadata = { title: "Injury Log / RTP — Bridgetx" };

const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type AthleteEmbed = { id: string; first_name: string; last_name: string; code: string };
type InjuryRow = {
  id: string;
  athlete_id: string;
  date: string;
  type: string;
  description: string | null;
  status: string;
  rtp_phase: string | null;
  target_return_date: string | null;
  cleared_date: string | null;
  provider_id: string;
  created_at: string;
  // Arrives via the FK embed on the query below — replaces a second
  // round trip that fetched provider ids then looked up profiles.
  provider: { first_name: string | null; last_name: string | null } | null;
};

export default async function TeamInjuriesPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  const { data: rosterData } = await supabase
    .from("athlete_teams")
    .select("athlete_id, athletes(id, first_name, last_name, code)")
    .eq("team_id", teamId);

  // Many-to-one FK embed, same verified pattern as app/staff/[teamId]/page.tsx.
  const athletes = (rosterData ?? [])
    .map((row) => row.athletes as unknown as AthleteEmbed | null)
    .filter((a): a is AthleteEmbed => a !== null)
    .sort((a, b) => a.last_name.localeCompare(b.last_name));
  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  const athleteIds = athletes.map((a) => a.id);

  let injuriesData: InjuryRow[] = [];
  let fetchError: string | null = null;
  if (athleteIds.length > 0) {
    const { data, error } = await supabase
      .from("injuries")
      .select(
        "id, athlete_id, date, type, description, status, rtp_phase, target_return_date, cleared_date, provider_id, created_at, provider:profiles!provider_id(first_name, last_name)"
      )
      .in("athlete_id", athleteIds)
      .order("date", { ascending: false });
    if (error) fetchError = error.message;
    injuriesData = (data ?? []) as unknown as InjuryRow[];
  }


  const now = Date.now();
  const records: InjuryRecord[] = injuriesData.map((i) => {
    const athlete = athleteById.get(i.athlete_id);
    return {
      id: i.id,
      athleteId: i.athlete_id,
      athleteName: athlete ? `${athlete.first_name} ${athlete.last_name}` : "Unknown athlete",
      date: i.date,
      type: i.type,
      description: i.description,
      status: i.status,
      rtpPhase: i.rtp_phase,
      targetReturnDate: i.target_return_date,
      clearedDate: i.cleared_date,
      providerName: personName(i.provider),
      isEditable: now <= new Date(i.created_at).getTime() + EDIT_WINDOW_MS,
    };
  });

  const athletesForClient = athletes.map((a) => ({
    id: a.id,
    firstName: a.first_name,
    lastName: a.last_name,
    code: a.code,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Injury Log / Return to Play
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Full clinical detail is staff-only — athletes only ever see a simplified status. Any club
          staff member can edit an entry within 7 days of it being logged.
        </p>
      </div>

      {fetchError && (
        <p
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load injuries: {fetchError}
        </p>
      )}

      {athletes.length === 0 ? (
        <div
          className={`${CARD} p-10 text-center`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p style={{ color: "var(--text-muted)" }}>No athletes on this team yet.</p>
        </div>
      ) : (
        <InjuriesClient teamId={teamId} athletes={athletesForClient} injuries={records} />
      )}
    </div>
  );
}
