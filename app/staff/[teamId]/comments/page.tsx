import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getStaffTeamContext } from "@/lib/staffTeamContext";
import { readComments, commentAuthorName } from "@/lib/comments";
import CommentsClient, { type CommentRecord } from "./CommentsClient";
import { NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "Comments — Bridgetx" };

type AthleteEmbed = { id: string; first_name: string; last_name: string; code: string };

// The select, the column list and the author embed now live in lib/comments.ts,
// which the Athlete Profile's Comments section also calls. They were duplicated
// while the profile had no comments section; keeping two copies once it did
// would have meant two places a comment_type or author filter could appear,
// with only one of them reviewed. See the header of that file for why the
// privacy rule is not — and must not be — expressed in either call site.
//
// This page still owns everything that is genuinely ITS OWN: the team + roster
// scope it asks for, the target label, and the moderation affordances below.

export default async function TeamCommentsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();
  // Profile, team, and the club-wide manager check were all resolved by the
  // layout's single context query. getStaffTeamContext is React-cached, so
  // reading them here costs nothing — this used to repeat the layout's work
  // with three more round trips (profiles, teams, club_staff).
  const context = await getStaffTeamContext(teamId);
  if (!context) return null;
  const { profile, team, isManager } = context;
  const teamName = team.name;

  const { data: rosterData } = await supabase
    .from("athlete_teams")
    .select("athlete_id, athletes(id, first_name, last_name, code)")
    .eq("team_id", teamId);
  const athletes = (rosterData ?? [])
    .map((row) => row.athletes as unknown as AthleteEmbed | null)
    .filter((a): a is AthleteEmbed => a !== null)
    .sort((a, b) => a.last_name.localeCompare(b.last_name));
  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  const athleteIds = athletes.map((a) => a.id);

  // Same two scope branches as before: this team's own entries, plus
  // individual entries for anyone on its roster.
  const { rows, error: fetchError } = await readComments({ teamId, athleteIds });

  const comments: CommentRecord[] = rows.map((r) => {
    const athlete = r.athlete_id ? athleteById.get(r.athlete_id) : null;
    return {
      id: r.id,
      authorId: r.author_id,
      authorName: commentAuthorName(r),
      commentType: r.comment_type,
      body: r.body,
      reflectInAi: r.reflect_in_ai,
      aiReflectionDisabledBy: r.ai_reflection_disabled_by,
      targetLabel: r.team_id ? `${teamName} (team-wide)` : athlete ? `${athlete.first_name} ${athlete.last_name}` : "Unknown athlete",
      createdAt: r.created_at,
      isOwn: r.author_id === profile.id,
      // isManager is false for oversight roles, but Super Admin holds the
      // moderation power too (2026-08-28 parity ruling) — mirror of the
      // toggleReflection action's own gate.
      canToggleOff:
        (isManager || profile.role === "super_admin") &&
        r.comment_type === "official_comment" &&
        r.reflect_in_ai,
    };
  });

  const athletesForClient = athletes.map((a) => ({ id: a.id, firstName: a.first_name, lastName: a.last_name, code: a.code }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Comments
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Official Comments are visible to everyone with legitimate access to that athlete/team.
          Private Notes are visible only to you.
        </p>
      </div>

      {fetchError && (
        <p
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load comments: {fetchError}
        </p>
      )}

      <CommentsClient teamId={teamId} teamName={teamName} athletes={athletesForClient} comments={comments} />
    </div>
  );
}
