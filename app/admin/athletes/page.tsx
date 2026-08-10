import type { Metadata } from "next";
import { getAssignedClubs, getScopedAthletes, getScopeNoun } from "@/lib/adminScope";
import EmptyState from "@/components/EmptyState";
import { CARD, NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "Athletes — Admin — Bridgetx" };

const TIER_LABEL: Record<string, string> = {
  development: "Development",
  performance: "Performance",
  elite: "Elite",
};

// Read-only. Registering athletes and editing their profiles belongs to the
// Club Manager / Club Practitioner dashboards — the Admin's role here is
// oversight across assigned clubs (docs/02-roles-and-permissions.md).
export default async function AdminAthletesPage() {
  const clubs = await getAssignedClubs();
  const scopeNoun = await getScopeNoun();
  const { athletes, error } = await getScopedAthletes(clubs);

  type Row = (typeof athletes)[number] & {
    sport?: string;
    position?: string | null;
    tier?: string | null;
    status?: string;
  };
  const rows = athletes as Row[];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Athletes
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Every athlete across the clubs assigned to you. View-only — athletes are registered and
          edited from their club&apos;s own dashboard.
        </p>
      </div>

      {error && (
        <p
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load athletes: {error}
        </p>
      )}

      {!error && clubs.length === 0 && (
        <EmptyState message="You don't have any clubs assigned yet. A Super Admin assigns clubs to you." />
      )}

      {!error && clubs.length > 0 && rows.length === 0 && (
        <EmptyState message={`No athletes registered at ${scopeNoun} yet.`} />
      )}

      {!error && rows.length > 0 && (
        <div
          className={`overflow-x-auto ${CARD}`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Athlete", "Club", "Code", "Sport", "Position", "Tier", "Status"].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-5 py-3 font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => (
                <tr key={a.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                    {a.first_name} {a.last_name}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                    {a.clubName}
                  </td>
                  <td
                    className="whitespace-nowrap px-5 py-3"
                    style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                  >
                    {a.code}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                    {a.sport ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                    {a.position ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                    {a.tier ? TIER_LABEL[a.tier] ?? a.tier : "—"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>
                    {a.status === "read_only" ? "Read-only" : "Active"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
