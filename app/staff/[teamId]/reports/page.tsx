import { redirect } from "next/navigation";

// /reports has no content of its own now that Generate and History are real
// routes. It stays as a redirect rather than being deleted, because it is a
// live URL: the team sidebar, the Athlete Profile's links, six months of
// browser history and any bookmark all point here.
//
// ?athlete= IS CARRIED ACROSS. That parameter is the Athlete Profile's
// "Generate Report" deep link, and dropping it on the redirect would turn a
// pre-filled generator into a blank one — the link would still "work", which is
// exactly what would stop anyone noticing it had broken. Re-encoded rather than
// passed through: the value lands in a URL we construct, and the generator
// validates it against the roster before trusting it either way.
export default async function ReportsIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ athlete?: string }>;
}) {
  const { teamId } = await params;
  const { athlete } = await searchParams;

  const target = `/staff/${teamId}/reports/generate`;
  redirect(athlete ? `${target}?athlete=${encodeURIComponent(athlete)}` : target);
}
