import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAssignedClubs, getScopedAthletes, getScopeNoun } from "@/lib/adminScope";
import { INJURY_STATUSES, RTP_PHASES } from "@/lib/constants";
import EmptyState from "@/components/EmptyState";

export const metadata: Metadata = { title: "Injury Log / Return to Play — Admin — Bridgetx" };

const STATUS_COLOR: Record<string, string> = {
  active: "var(--danger)",
  recovering: "var(--brand-blue)",
  cleared: "var(--success)",
};
const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  INJURY_STATUSES.map((s) => [s.value, s.label])
);
const RTP_LABEL: Record<string, string> = Object.fromEntries(RTP_PHASES.map((p) => [p.value, p.label]));

type InjuryRow = {
  id: string;
  athlete_id: string;
  date: string;
  type: string;
  description: string | null;
  status: string;
  rtp_phase: string | null;
  target_return_date: string | null;
  provider_id: string;
  // Arrives via the FK embed on the query below — replaces a second
  // round trip that fetched provider ids then looked up profiles.
  provider: { first_name: string | null; last_name: string | null } | null;
};

function personName(p: { first_name: string | null; last_name: string | null } | null): string {
  if (!p) return "—";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}

// Read-only. Admin sits in the Medical/clinical data-sensitivity tier
// (docs/02-roles-and-permissions.md), so full clinical detail is shown —
// unlike the athlete-facing view, which is restricted to status/rtp_phase
// by injuries_athlete_view. Logging and editing stays with Club
// Practitioners.
export default async function AdminInjuriesPage() {
  const clubs = await getAssignedClubs();
  const scopeNoun = await getScopeNoun();
  const { athletes, error: athleteError } = await getScopedAthletes(clubs);
  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  const athleteIds = athletes.map((a) => a.id);

  const supabase = await createClient();
  let rows: InjuryRow[] = [];
  let fetchError: string | null = null;
  if (athleteIds.length > 0) {
    const { data, error } = await supabase
      .from("injuries")
      .select(
        "id, athlete_id, date, type, description, status, rtp_phase, target_return_date, provider_id, provider:profiles!provider_id(first_name, last_name)"
      )
      .in("athlete_id", athleteIds)
      .order("date", { ascending: false });
    rows = (data ?? []) as unknown as InjuryRow[];
    fetchError = error?.message ?? null;
  }

  const activeCount = rows.filter((r) => r.status === "active").length;
  const inRtp = rows.filter((r) => r.rtp_phase && r.rtp_phase !== "returned").length;
  const error = athleteError ?? fetchError;

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
          Injuries and return-to-play phases across ${scopeNoun}. View-only — injuries are
          logged by Club Practitioners.
        </p>
      </div>

      {error && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load the injury log: {error}
        </p>
      )}

      {!error && clubs.length === 0 && (
        <EmptyState message="You don't have any clubs assigned yet. A Super Admin assigns clubs to you." />
      )}

      {!error && clubs.length > 0 && rows.length === 0 && (
        <EmptyState message={`No injuries logged at ${scopeNoun}.`} />
      )}

      {!error && rows.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div
              className="rounded-xl border p-5"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
            >
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Active injuries
              </p>
              <p
                className="mt-1 text-2xl font-semibold"
                style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
              >
                {activeCount}
              </p>
            </div>
            <div
              className="rounded-xl border p-5"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
            >
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                In return-to-play
              </p>
              <p
                className="mt-1 text-2xl font-semibold"
                style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
              >
                {inRtp}
              </p>
            </div>
            <div
              className="rounded-xl border p-5"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
            >
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Total logged
              </p>
              <p
                className="mt-1 text-2xl font-semibold"
                style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
              >
                {rows.length}
              </p>
            </div>
          </div>

          <div
            className="overflow-x-auto rounded-xl border"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Athlete", "Club", "Date", "Type", "Status", "RTP phase", "Target return", "Logged by"].map(
                    (h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-5 py-3 font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const athlete = athleteById.get(r.athlete_id);
                  const color = STATUS_COLOR[r.status] ?? "var(--text-muted)";
                  return (
                    <tr key={r.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                      <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                        {athlete ? `${athlete.first_name} ${athlete.last_name}` : "Unknown athlete"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                        {athlete?.clubName ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                        {r.date}
                      </td>
                      <td className="px-5 py-3" style={{ color: "var(--text)" }}>
                        {r.type}
                        {r.description && (
                          <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                            {r.description}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 text-sm font-medium"
                          style={{ color }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                        {r.rtp_phase ? RTP_LABEL[r.rtp_phase] ?? r.rtp_phase : "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                        {r.target_return_date ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                        {personName(r.provider)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
