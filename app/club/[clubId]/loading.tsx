import PageSkeleton from "@/components/PageSkeleton";

// The destination of /admin's "Open a club…" switcher, and of the club
// switcher inside a team workspace — the same dead-click window the Super
// Admin side had, on a different route tree. Covers every page under
// /club/[clubId], not just the overview.
//
// Three stat cards, not four: the club overview's grid is sm:grid-cols-3.
export default function ClubLoading() {
  return <PageSkeleton stats={3} />;
}
