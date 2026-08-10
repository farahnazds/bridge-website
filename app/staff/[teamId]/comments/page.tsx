import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getStaffTeamContext } from "@/lib/staffTeamContext";
import CommentsClient, { type CommentRecord } from "./CommentsClient";
import { NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "Comments — Bridgetx" };

type AthleteEmbed = { id: string; first_name: string; last_name: string; code: string };
type CommentRow = {
  id: string;
  athlete_id: string | null;
  team_id: string | null;
  author_id: string;
  // Arrives via the FK embed on the query below — replaces a second
  // round trip that fetched author ids then looked up profiles.
  author: { first_name: string | null; last_name: string | null } | null;
  comment_type: "private_note" | "official_comment";
  body: string;
  reflect_in_ai: boolean;
  ai_reflection_disabled_by: string | null;
  created_at: string;
};

function personName(p: { first_name: string | null; last_name: string | null } | null): string {
  if (!p) return "—";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}

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

  const orFilters = [`team_id.eq.${teamId}`];
  if (athleteIds.length > 0) orFilters.push(`athlete_id.in.(${athleteIds.join(",")})`);

  const { data: commentRows, error: fetchError } = await supabase
    .from("comments")
    .select(
      "id, athlete_id, team_id, author_id, comment_type, body, reflect_in_ai, ai_reflection_disabled_by, created_at, author:profiles!author_id(first_name, last_name)"
    )
    .or(orFilters.join(","))
    .order("created_at", { ascending: false });

  const rows = (commentRows ?? []) as unknown as CommentRow[];
  const comments: CommentRecord[] = rows.map((r) => {
    const athlete = r.athlete_id ? athleteById.get(r.athlete_id) : null;
    return {
      id: r.id,
      authorId: r.author_id,
      authorName: personName(r.author),
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
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load comments: {fetchError.message}
        </p>
      )}

      <CommentsClient teamId={teamId} teamName={teamName} athletes={athletesForClient} comments={comments} />
    </div>
  );
}
