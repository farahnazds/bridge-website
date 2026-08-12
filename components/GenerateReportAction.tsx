import Link from "next/link";
import { FileText } from "lucide-react";
import { BTN_PRIMARY } from "@/lib/ui";

// "Generate Report" on the Athlete Profile.
//
// A LINK INTO THE REAL REPORTS PAGE, NOT A MODAL. The generator carries
// audience selection, multi-type combining, the report period and the safety
// checks that run over the produced text — that needs the page's room, and a
// dialog would have squeezed the one flow on this profile that genuinely
// benefits from space. It is also the flow least like a "quick add": nothing is
// saved in a second, generation is synchronous and can take a while, and the
// result is then read and shared from the same screen.
//
// A plain server component: no state, no client bundle.
//
// THE LINK CARRIES ONLY THE ATHLETE.
//
// It used to carry a suggested period start too. That moved to the Reports
// page for two reasons, and the second is the one that mattered:
//
//  1. The page already holds every report it may see, so it can derive the
//     date itself — a date in the URL was duplicated state that could be
//     hand-edited into an inverted period.
//  2. Lookback is PER REPORT TYPE ("since the last Compliance report", "since
//     the last Nutrition report"), and one date in a URL cannot express that.
//     Generating a Performance report should not have its window cut short
//     because a Nutrition report happened to be produced last week.
//
// The athlete id is still re-validated against the roster on arrival, so a
// hand-edited link degrades to an unfilled form with an explanatory notice
// rather than pre-filling someone else. RLS and the generate actions remain the
// actual boundary either way.

export default function GenerateReportAction({
  teamId,
  athleteId,
}: {
  teamId: string;
  athleteId: string;
}) {
  return (
    <Link
      href={`/staff/${teamId}/reports?athlete=${athleteId}`}
      className={`${BTN_PRIMARY} inline-flex items-center gap-1.5`}
      style={{ backgroundImage: "var(--brand-gradient-action)" }}
    >
      <FileText size={14} aria-hidden="true" />
      Generate Report
    </Link>
  );
}
