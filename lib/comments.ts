import { createClient } from "@/lib/supabase/server";

// The ONE comments read in this app. Both surfaces that show comments call it:
//
//   app/staff/[teamId]/comments/page.tsx   the dedicated Comments page
//   lib/athleteProfile.ts                  the Athlete Profile's section
//
// WHY THIS FILE EXISTS
//
// The Athlete Profile's Comments section shows private notes and official
// comments in the same table, so it is the first place in the app where the
// Flow 8 privacy rule is visible on a surface that is not the Comments page.
// Two hand-written copies of the same select would be two places that could
// each grow a filter, and only one of them would be reviewed the day someone
// changed the rule. There is now one.
//
// WHERE THE PRIVACY RULE ACTUALLY LIVES — NOT HERE
//
// This function applies NO comment_type predicate and NO author predicate, and
// neither call site adds one. It asks for every comment in a SCOPE and lets
// RLS decide who may see what. `comments` carries exactly three SELECT
// policies (database/schema.sql, Section 9):
//
//   "author reads own comment"       author_id = current_profile_id() — any type
//   "linked read official comments"  official_comment AND linked to athlete/team
//   "super admin full access"
//
// There is no Club Manager arm and no Admin arm for private_note, so a private
// note reaches its author and nobody else. Verified live with real user JWTs,
// not the service key — see database/rls-policies.md.
//
// The distinction this file is built around: SCOPE (which athlete or team the
// comments are about) is a product question and differs per call site. VISIBILITY
// (who may read them) is a security question, is identical everywhere, and is
// answered by the database. Only scope is a parameter below.

/** The row shape both call sites map from. Column list is fixed here so the
 *  two cannot ask for different fields and render the same comment differently. */
export interface CommentRow {
  id: string;
  athlete_id: string | null;
  team_id: string | null;
  author_id: string;
  author: { first_name: string | null; last_name: string | null } | null;
  comment_type: "private_note" | "official_comment";
  body: string;
  reflect_in_ai: boolean;
  ai_reflection_disabled_by: string | null;
  created_at: string;
}

const COMMENT_SELECT =
  "id, athlete_id, team_id, author_id, comment_type, body, reflect_in_ai, ai_reflection_disabled_by, created_at, author:profiles!author_id(first_name, last_name)";

export interface CommentScope {
  /** Include comments attached to this team (team-wide entries). */
  teamId?: string | null;
  /** Include comments attached to any of these athletes. */
  athleteIds?: string[];
  /** Cap the number of rows returned, newest first. A truncation for display
   *  only — it never changes WHICH rows are permitted, just how many of the
   *  permitted ones are shown, exactly like "ten most recent assessments". */
  limit?: number;
}

/**
 * Comments within a scope, newest first, as RLS permits them to the CALLER.
 *
 * Runs on the caller's own client. Passing no scope returns nothing rather
 * than everything — an unscoped read is always a mistake here, and failing
 * closed is the only safe reading of it.
 *
 * The error is returned rather than thrown or swallowed: the Comments page
 * renders it in a banner, and the Athlete Profile's section simply shows its
 * empty state. Swallowing it here would have silently turned "the read failed"
 * into "this athlete has no comments", which on a privacy-bearing list is the
 * more misleading of the two.
 */
export async function readComments(
  { teamId, athleteIds, limit }: CommentScope
): Promise<{ rows: CommentRow[]; error: string | null }> {
  const branches: string[] = [];
  if (teamId) branches.push(`team_id.eq.${teamId}`);
  if (athleteIds && athleteIds.length > 0) branches.push(`athlete_id.in.(${athleteIds.join(",")})`);
  if (branches.length === 0) return { rows: [], error: null };

  const supabase = await createClient();
  let query = supabase
    .from("comments")
    .select(COMMENT_SELECT)
    .or(branches.join(","))
    .order("created_at", { ascending: false });
  if (limit !== undefined) query = query.limit(limit);

  const { data, error } = await query;
  return {
    rows: (data ?? []) as unknown as CommentRow[],
    error: error ? error.message : null,
  };
}

/** Display name for a comment's author, matching how every other surface in
 *  this app renders a person from an FK embed. */
export function commentAuthorName(row: CommentRow): string {
  const p = row.author;
  if (!p) return "—";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}
