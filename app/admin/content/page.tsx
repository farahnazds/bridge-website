import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAssignedClubs, getScopeNoun } from "@/lib/adminScope";
import EmptyState from "@/components/EmptyState";
import { BADGE } from "@/lib/ui";

export const metadata: Metadata = { title: "Content/Relay — Admin — Bridgetx" };

type ContentRow = {
  id: string;
  created_by: string | null;
  // Arrives via the FK embed on the query below — replaces a second
  // round trip that fetched author ids then looked up profiles.
  author: { first_name: string | null; last_name: string | null } | null;
  title: string;
  body: string | null;
  file_url: string | null;
  category: string | null;
  target_type: string;
  target_club_id: string | null;
  published_at: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// IMPORTANT — this page's query filter is the ONLY scoping boundary.
//
// Unlike every other Admin section, `content` is NOT scoped by RLS: it
// carries "authenticated read targeted content" for select using
// (auth.uid() is not null), which lets any logged-in user read every row,
// including content targeted at another club or an individual athlete.
// Verified live. So the .or() filter below is load-bearing, not defence in
// depth — removing it leaks other clubs' targeted content immediately.
// Documented as a known gap in database/rls-policies.md.
// ---------------------------------------------------------------------------
function personName(p: { first_name: string | null; last_name: string | null } | null): string {
  if (!p) return "—";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}

export default async function AdminContentPage() {
  const clubs = await getAssignedClubs();
  const scopeNoun = await getScopeNoun();
  const clubNameById = new Map(clubs.map((c) => [c.id, c.name]));
  const clubIds = clubs.map((c) => c.id);

  const supabase = await createClient();
  let rows: ContentRow[] = [];
  let error: string | null = null;

  // Platform-wide content (target_type = 'all') is genuinely intended for
  // every club, so it belongs here alongside club-targeted rows. Anything
  // aimed at another club, another segment, or an individual athlete is
  // excluded.
  const filters = ["target_type.eq.all"];
  if (clubIds.length > 0) filters.push(`target_club_id.in.(${clubIds.join(",")})`);

  const { data, error: fetchError } = await supabase
    .from("content")
    .select(
      "id, created_by, title, body, file_url, category, target_type, target_club_id, published_at, created_at, author:profiles!created_by(first_name, last_name)"
    )
    .or(filters.join(","))
    .order("created_at", { ascending: false });
  rows = (data ?? []) as unknown as ContentRow[];
  error = fetchError?.message ?? null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Content/Relay
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Platform-wide content plus anything relayed specifically to ${scopeNoun}.
        </p>
      </div>

      {error && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load content: {error}
        </p>
      )}

      {!error && rows.length === 0 && (
        <EmptyState message={`No content published to ${scopeNoun} yet.`} />
      )}

      {!error && rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border p-5"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                    {r.title}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {r.category ? `${r.category} · ` : ""}
                    {r.published_at
                      ? `Published ${new Date(r.published_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}`
                      : "Not published"}
                    {r.author ? ` · ${personName(r.author)}` : ""}
                  </p>
                </div>
                <span
                  className={BADGE}
                  style={
                    r.target_type === "all"
                      ? { backgroundColor: "var(--bg)", color: "var(--text-muted)", border: "1px solid var(--border)" }
                      : {
                          backgroundColor: "color-mix(in srgb, var(--brand-blue) 12%, transparent)",
                          color: "var(--brand-blue)",
                        }
                  }
                >
                  {r.target_type === "all"
                    ? "Platform-wide"
                    : r.target_club_id
                      ? clubNameById.get(r.target_club_id) ?? "Club"
                      : r.target_type}
                </span>
              </div>

              {r.body && (
                <details className="mt-3">
                  <summary
                    className="cursor-pointer text-xs font-medium"
                    style={{ color: "var(--brand-blue)" }}
                  >
                    View content
                  </summary>
                  <div
                    className="mt-3 rounded-lg border p-4 whitespace-pre-wrap text-sm leading-relaxed"
                    style={{
                      borderColor: "var(--border)",
                      backgroundColor: "var(--bg)",
                      color: "var(--text)",
                    }}
                  >
                    {r.body}
                  </div>
                </details>
              )}

              {r.file_url && (
                <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  Attachment: <span style={{ fontFamily: "var(--font-mono)" }}>{r.file_url}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
