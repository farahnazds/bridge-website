import "server-only";
import { createClient, createClientFromCookieSnapshot } from "@/lib/supabase/server";

// "Where was I last?" for the dashboards that used to open on a chooser.
// See database/migrations/030_last_used_context.sql for why this is its own
// table rather than a column on staff_team_assignments.

export type ContextType = "team" | "club";

/**
 * The id this person last opened for the given scope, or null if they never
 * have. Never treat the result as permission — see pickDefault().
 */
export async function getLastUsedContextId(
  profileId: string,
  contextType: ContextType
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_last_context")
    .select("context_id")
    .eq("profile_id", profileId)
    .eq("context_type", contextType)
    .maybeSingle();

  return (data?.context_id as string | undefined) ?? null;
}

/**
 * Record that this person just opened `contextId`.
 *
 * Called from the team/club layouts inside `after()`, so it runs once the
 * response has already been sent and adds nothing to the page's critical
 * path — that path is already the slowest in the app and this is a
 * convenience preference, not something worth a round trip of latency.
 *
 * Takes a COOKIE SNAPSHOT rather than reading cookies itself. Next.js forbids
 * `cookies()` inside `after()` from a Server Component, and the failure is
 * quiet: createClient() throws, the catch below swallows it, the page renders
 * perfectly and the row is simply never written. This signature is what makes
 * that mistake impossible to repeat — the caller must read cookies during
 * render, where it is legal, and hand the result in.
 *
 * Failures stay swallowed on purpose: a dashboard must still render if
 * writing a preference fails. The write goes through the caller's own session,
 * so RLS still restricts it to their own row.
 */
export async function recordLastUsedContext(
  cookieSnapshot: { name: string; value: string }[],
  profileId: string,
  contextType: ContextType,
  contextId: string
): Promise<void> {
  try {
    const supabase = createClientFromCookieSnapshot(cookieSnapshot);
    await supabase.from("user_last_context").upsert(
      {
        profile_id: profileId,
        context_type: contextType,
        context_id: contextId,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,context_type" }
    );
  } catch {
    // Preference write only — never block or fail a page render over it.
  }
}

/**
 * Choose where to land: the last-used option if it is STILL one this caller
 * may open, otherwise the first in the list.
 *
 * `options` must already be in the order the caller considers canonical —
 * every call site sorts by name, which is what makes the fallback
 * "first alphabetically".
 *
 * The `.find()` is the security-relevant line. The stored id is re-checked
 * against the caller's current permitted list on every resolve, so a team
 * someone was unassigned from (or that was deleted) can never be resolved
 * into — it simply misses and falls back.
 */
export function pickDefault<T extends { id: string }>(
  options: T[],
  lastUsedId: string | null
): T | null {
  if (options.length === 0) return null;
  return options.find((o) => o.id === lastUsedId) ?? options[0];
}
