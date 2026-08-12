import { getComplianceDetail } from "@/lib/complianceDetail";

// Compliance detail for one athlete, fetched when the Athlete Profile's
// Compliance section is opened.
//
// On demand rather than in the profile's payload for the same reason report
// summaries are: the history is one row per check-in and grows for as long as
// the athlete is with the club, and nobody has asked to read it just by loading
// the profile. The profile keeps its small summary; this fills the modal.
//
// ?days= is REQUIRED in practice (defaulted below) because the calendar-day
// completion rate needs a denominator — over "all time" it has none. The
// practitioner surfaces are windowed at 30 days, matching the summary on the
// profile that this modal expands and the team page's window; the athlete's own
// page is the one place that shows their whole record, where the
// days-logged rate is the documented measure instead.
//
// AUTHORISATION IS STRUCTURAL, and this handler performs no role check of its
// own — same as the sibling /api/reports/[reportId]/summary and /pdf routes.
// getComplianceDetail runs on the caller's own client, so `checkins` RLS
// decides what comes back: a practitioner reads their team's athletes
// ("linked practitioners read"), an athlete reads their own, and anyone else
// gets an empty history. There is deliberately no "is this athlete on your
// team" logic here to drift out of step with the policy.
//
// An empty history and an unauthorised athlete are therefore indistinguishable
// from outside, which is intended — it reveals nothing about whether a given
// athlete id exists.

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

export async function GET(request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params;
  const raw = new URL(request.url).searchParams.get("days");
  const parsed = raw === null ? DEFAULT_DAYS : Number(raw);
  // Bounded and sanitised: a caller cannot ask for an unbounded scan, and a
  // nonsense value falls back rather than producing a nonsense denominator.
  const days =
    Number.isInteger(parsed) && parsed > 0 && parsed <= MAX_DAYS ? parsed : DEFAULT_DAYS;

  const data = await getComplianceDetail(athleteId, days);
  return Response.json(
    { ...data, windowDays: days },
    // Per-caller clinical data: never let a shared cache hold it.
    { headers: { "Cache-Control": "no-store" } }
  );
}
