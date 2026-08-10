import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Athletes — Bridgetx",
};

const TIER_LABEL: Record<string, string> = {
  development: "Development",
  performance: "Performance",
  elite: "Elite",
};

export default async function ClubAthletesPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  const supabase = await createClient();

  const { data: athletes, error } = await supabase
    .from("athletes")
    .select("id, first_name, last_name, code, sport, position, tier, status")
    .eq("club_id", clubId)
    .order("last_name", { ascending: true });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
          >
            Athletes
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Everyone registered to this club.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/club/${clubId}/athletes/import`}
            className="rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors duration-150"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            Import CSV
          </Link>
          <Link
            href={`/club/${clubId}/athletes/new`}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity duration-200 ease-out hover:opacity-90"
            style={{ backgroundImage: "var(--brand-gradient)" }}
          >
            + Register Athlete
          </Link>
        </div>
      </div>

      {error && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load athletes: {error.message}
        </p>
      )}

      {!error && athletes && athletes.length === 0 && (
        <div
          className="rounded-xl border p-10 text-center"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p style={{ color: "var(--text-muted)" }}>
            No athletes registered yet.
          </p>
        </div>
      )}

      {!error && athletes && athletes.length > 0 && (
        <div
          className="overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Name
                </th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Code
                </th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Sport
                </th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Position
                </th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Tier
                </th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {athletes.map((athlete) => (
                <tr key={athlete.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-5 py-3 font-medium">
                    <Link href={`/club/${clubId}/athletes/${athlete.id}`} style={{ color: "var(--brand-blue)" }}>
                      {athlete.first_name} {athlete.last_name}
                    </Link>
                  </td>
                  <td
                    className="px-5 py-3"
                    style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                  >
                    {athlete.code}
                  </td>
                  <td className="px-5 py-3" style={{ color: "var(--text)" }}>
                    {athlete.sport}
                  </td>
                  <td className="px-5 py-3" style={{ color: "var(--text)" }}>
                    {athlete.position ?? "—"}
                  </td>
                  <td className="px-5 py-3" style={{ color: "var(--text)" }}>
                    {athlete.tier ? TIER_LABEL[athlete.tier] ?? athlete.tier : "—"}
                  </td>
                  <td className="px-5 py-3" style={{ color: "var(--text)" }}>
                    {athlete.status === "read_only" ? "Read-only" : "Active"}
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
