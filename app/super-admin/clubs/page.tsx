import type { Metadata } from "next";
import { BTN_PRIMARY, CARD, NOTICE } from "@/lib/ui";
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
          className={BTN_PRIMARY}
          style={{ backgroundImage: "var(--brand-gradient-action)" }}
        >
          + New Club
        </Link>
      </div>

      {error && (
        <p
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load clubs: {error.message}
        </p>
      )}

      {!error && clubs && clubs.length === 0 && (
        <div
          className={`${CARD} p-10 text-center`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p style={{ color: "var(--text-muted)" }}>
            No clubs yet. Add the first one to get started.
          </p>
        </div>
      )}

      {!error && clubs && clubs.length > 0 && (
        <div
          className={`overflow-x-auto ${CARD}`}
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
                  <td className="px-5 py-3 font-medium">
                    <Link
                      href={`/super-admin/clubs/${club.id}`}
                      className="underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{ color: "var(--brand-blue)" }}
                    >
                      {club.name}
                    </Link>
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
