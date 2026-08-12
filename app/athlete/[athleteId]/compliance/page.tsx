import type { Metadata } from "next";
import ComplianceDetail from "@/components/ComplianceDetail";
import { getComplianceDetail } from "@/lib/complianceDetail";

export const metadata: Metadata = { title: "My Compliance — Bridgetx" };

// Athlete-facing full check-in history. The Home page shows a 7-day snapshot;
// this is the whole record with trends.
//
// The stats, the sparklines and the history table moved to
// components/ComplianceDetail.tsx and lib/complianceDetail.ts so the
// practitioner's team page and the Athlete Profile's modal render the SAME
// implementation rather than a second copy. Nothing about what this page shows
// changed in the move, with one addition: nutrition now has a sparkline
// alongside the other three, which only became possible when migration 034 gave
// it a numeric twin.
//
// `rateMode="logged"` keeps this page's documented definition — completion
// measured against days actually LOGGED, not calendar days, because a day with
// no row is "not logged" and that is a different thing from an explicit skip.
// The practitioner surfaces deliberately use the calendar denominator instead;
// see lib/complianceDetail.ts.
//
// Access: `checkins` RLS ("athlete reads own checkins") scopes every row to the
// caller, and the layout has already established that the caller owns this
// athleteId.

export default async function MyCompliancePage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const { athleteId } = await params;
  // No window: the athlete sees their whole record, as before.
  const data = await getComplianceDetail(athleteId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          My Compliance
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Every check-in you&apos;ve logged, and how your scores are trending.
        </p>
      </div>

      <ComplianceDetail
        data={data}
        rateMode="logged"
        emptyMessage="No check-ins logged yet. Your daily check-in takes about a minute."
      />
    </div>
  );
}
