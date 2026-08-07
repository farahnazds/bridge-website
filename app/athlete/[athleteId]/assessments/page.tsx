import { redirect } from "next/navigation";

// docs/03-site-map.md lists "My Body Composition" and "My Assessments" as two
// athlete pages, but they resolve to the same rows: `assessments` IS the
// body-composition record and there is no second source. Rather than ship two
// near-identical views, the assessment history — including validity tier and
// practitioner notes, which is what this entry was for — lives in the
// body-composition page, and this route redirects there.
//
// Kept as a redirect rather than deleted so existing links, bookmarks and the
// site map's URL stay valid.
export default async function MyAssessmentsPage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const { athleteId } = await params;
  redirect(`/athlete/${athleteId}/body-composition`);
}
