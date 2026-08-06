import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import CommentsClient, { type CommentRecord } from "./CommentsClient";

export const metadata: Metadata = { title: "Comments — Bridgetx" };

type AthleteEmbed = { id: string; first_name: string; last_name: string; code: string };
type CommentRow = {
  id: string;
  athlete_id: string | null;
  team_id: string | null;
  author_id: string;
  comment_type: "private_note" | "official_comment";
  body: string;
  reflect_in_ai: boolean;
  ai_reflection_disabled_by: string | null;
  created_at: string;
};

export default async function TeamCommentsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const { data: teamRow } = await supabase.from("teams").select("id, name, club_id").eq("id", teamId).single();
  const teamName = teamRow?.name ?? "Team";

  // Same club_staff check as the layout — see
  // app/staff/[teamId]/layout.tsx for why this is club-wide (club_staff)
  // rather than per-team (staff_team_assignments) for managers.
  let isManager = false;
  if (profile.role === "club_manager" && teamRow) {
    const { data: managerRow } = await supabase
      .from("club_staff")
      .select("id")
      .eq("profile_id", profile.id)
      .eq("club_id", teamRow.club_id)
      .eq("staff_role", "club_manager")
      .maybeSingle();
    isManager = !!managerRow;
  }

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

  const orFilters = [`team_id.eq.${teamId}`];
  if (athleteIds.length > 0) orFilters.push(`athlete_id.in.(${athleteIds.join(",")})`);

  const { data: commentRows, error: fetchError } = await supabase
    .from("comments")
    .select("id, athlete_id, team_id, author_id, comment_type, body, reflect_in_ai, ai_reflection_disabled_by, created_at")
    .or(orFilters.join(","))
    .order("created_at", { ascending: false });

  const rows = (commentRows ?? []) as CommentRow[];
  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  let authorById = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: authors } = await supabase.from("profiles").select("id, first_name, last_name").in("id", authorIds);
    authorById = new Map((authors ?? []).map((a) => [a.id, `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || "—"]));
  }

  const comments: CommentRecord[] = rows.map((r) => {
    const athlete = r.athlete_id ? athleteById.get(r.athlete_id) : null;
    return {
      id: r.id,
      authorId: r.author_id,
      authorName: authorById.get(r.author_id) ?? "—",
      commentType: r.comment_type,
      body: r.body,
      reflectInAi: r.reflect_in_ai,
      aiReflectionDisabledBy: r.ai_reflection_disabled_by,
      targetLabel: r.team_id ? `${teamName} (team-wide)` : athlete ? `${athlete.first_name} ${athlete.last_name}` : "Unknown athlete",
      createdAt: r.created_at,
      isOwn: r.author_id === profile.id,
      canToggleOff: isManager && r.comment_type === "official_comment" && r.reflect_in_ai,
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
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load comments: {fetchError.message}
        </p>
      )}

      <CommentsClient teamId={teamId} teamName={teamName} athletes={athletesForClient} comments={comments} />
    </div>
  );
}
