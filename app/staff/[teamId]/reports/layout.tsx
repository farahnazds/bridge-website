import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import ReportsNav from "./ReportsNav";

// Shared chrome for the three Reports routes: /generate, /history and the
// /nutrition planner. Holds the heading and the segmented switcher so they do
// not re-mount (and visibly flicker) when moving between them.
//
// COUNTS ARE `head: true`, count-only queries — no rows cross the wire for
// either badge. That matters more than it looks: the History badge is a count
// of reports, and fetching rows to derive it would have re-introduced exactly
// the payload problem lib/reportSearch.ts documents at length, on every page in
// this section including the two that never render a report list.
//
// Both counts are RLS-scoped by construction, because they run under the
// caller's own session. The History number is therefore "reports you can see",
// which is the same set the list itself shows — the two cannot disagree.
export default async function ReportsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  const [reports, athletes] = await Promise.all([
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("team_id", teamId),
    supabase.from("athlete_teams").select("athlete_id", { count: "exact", head: true }).eq("team_id", teamId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <ReportsNav teamId={teamId} reportCount={reports.count ?? 0} athleteCount={athletes.count ?? 0} />
      {children}
    </div>
  );
}
