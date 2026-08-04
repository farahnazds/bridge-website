import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Clubs — Super Admin — Bridgetx",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  grace_period: "Grace period",
  stopped: "Stopped",
};

const STATUS_COLOR: Record<string, string> = {
  active: "var(--success)",
  grace_period: "var(--warning)",
  stopped: "var(--danger)",
};

export default async function ClubsPage() {
  const supabase = await createClient();
  const { data: clubs, error } = await supabase
    .from("clubs")
    .select(
      "id, name, sport, timezone, subscription_status, stopped_by_super_admin, created_at"
    )
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
          >
            Clubs
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            All registered clubs and their subscription status.
          </p>
        </div>
        <Link
          href="/super-admin/clubs/new"
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity duration-200 ease-out hover:opacity-90"
          style={{ backgroundImage: "var(--brand-gradient)" }}
        >
          + New Club
        </Link>
      </div>

      {error && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load clubs: {error.message}
        </p>
      )}

      {!error && clubs && clubs.length === 0 && (
        <div
          className="rounded-xl border p-10 text-center"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p style={{ color: "var(--text-muted)" }}>
            No clubs yet. Add the first one to get started.
          </p>
        </div>
      )}

      {!error && clubs && clubs.length > 0 && (
        <div
          className="overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Club
                </th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Sport
                </th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Timezone
                </th>
                <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {clubs.map((club) => (
                <tr key={club.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                    {club.name}
                  </td>
                  <td className="px-5 py-3" style={{ color: "var(--text)" }}>
                    {club.sport}
                  </td>
                  <td
                    className="px-5 py-3"
                    style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                  >
                    {club.timezone}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className="inline-flex items-center gap-1.5 text-sm font-medium"
                      style={{
                        color: club.stopped_by_super_admin
                          ? "var(--danger)"
                          : STATUS_COLOR[club.subscription_status] ?? "var(--text-muted)",
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          backgroundColor: club.stopped_by_super_admin
                            ? "var(--danger)"
                            : STATUS_COLOR[club.subscription_status] ?? "var(--text-muted)",
                        }}
                      />
                      {club.stopped_by_super_admin
                        ? "Stopped (manual)"
                        : STATUS_LABEL[club.subscription_status] ?? club.subscription_status}
                    </span>
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
