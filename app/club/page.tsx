import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLastUsedContextId, pickDefault } from "@/lib/lastUsedContext";

export const metadata: Metadata = {
  title: "Your Clubs — Bridgetx",
};

// Landing spot for a club_manager whose club_staff rows don't resolve to
// exactly one club — see the club_manager case in resolvePostLoginPath()
// (lib/auth.ts). Zero clubs: nothing to manage yet. Multiple clubs: let
// them pick which one to open, same list this page and that function both
// derive from club_staff.
export default async function ClubIndexPage() {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "club_manager") redirect("/");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("club_staff")
    .select("club_id, clubs(id, name, sport)")
    .eq("profile_id", profile.id)
    .eq("staff_role", "club_manager");

  // club_staff.club_id -> clubs.id is many-to-one, so PostgREST returns a
  // single object here at runtime — supabase-js just can't express that
  // cardinality without generated Database types, so it infers this as an
  // array. Verified the actual response shape directly before casting.
  type ClubSummary = { id: string; name: string; sport: string };
  const clubs = (data ?? [])
    .map((row) => row.clubs as unknown as ClubSummary | null)
    .filter((club): club is ClubSummary => club !== null);

  // Same rule as /staff: a manager never picks a club first, at any count.
  // They land in the last-used one (first alphabetically the first time) and
  // change clubs with the switcher in the header. Applied here as well as in
  // resolvePostLoginPath() because this route is reachable directly, and a
  // hand-typed /club would otherwise resurrect the removed picker.
  //
  // Zero clubs falls through to the empty state below — nothing to enter.
  if (clubs.length > 0) {
    const sorted = [...clubs].sort((a, b) => a.name.localeCompare(b.name));
    const target = pickDefault(sorted, await getLastUsedContextId(profile.id, "club"));
    if (target) redirect(`/club/${target.id}`);
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 py-16"
      style={{ backgroundColor: "var(--bg)" }}
    >
      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
          >
            Your clubs
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {clubs.length > 0
              ? "Choose a club to open its dashboard."
              : "You're not currently assigned as a manager to any club."}
          </p>
        </div>

        {error && (
          <p
            className="rounded-lg border px-4 py-3 text-sm"
            style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
          >
            Couldn&apos;t load your clubs: {error.message}
          </p>
        )}

        {!error && clubs.length === 0 && (
          <div
            className="rounded-xl border p-10 text-center"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            <p style={{ color: "var(--text-muted)" }}>
              Contact your Bridgetx admin to be assigned as a Club Manager.
            </p>
          </div>
        )}

        {!error && clubs.length > 1 && (
          <div
            className="overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            {clubs.map((club, i) => (
              <Link
                key={club.id}
                href={`/club/${club.id}`}
                className="flex items-center justify-between px-5 py-4 text-sm transition-colors duration-150 hover:bg-[color:var(--bg)]"
                style={{
                  borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                }}
              >
                <span>
                  <span className="font-medium" style={{ color: "var(--text)" }}>
                    {club.name}
                  </span>
                  <span className="ml-2" style={{ color: "var(--text-muted)" }}>
                    {club.sport}
                  </span>
                </span>
                <span style={{ color: "var(--brand-blue)" }}>Open →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
