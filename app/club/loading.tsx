import { DashboardSkeleton } from "@/components/PageSkeleton";

// The boundary for /admin's "Open a club…" switcher, and for every other way
// into a club workspace from outside it.
//
// It has to sit HERE rather than at [clubId]: a loading.tsx only covers what
// renders below its own layout, and app/club/[clubId]/layout.tsx does its own
// awaiting (profile, the club row, its teams, the switcher's club list) before
// anything beneath it starts. A boundary inside that layout therefore can't
// catch the wait for the layout itself — measured, the jump from /admin sat on
// the old page for 2.5s with an inner boundary in place, and 0ms with this one.
//
// Chrome included, since the club header and sidebar are part of what is still
// loading at this point. Three stat cards: the club overview's grid is
// sm:grid-cols-3.
export default function ClubEntryLoading() {
  return <DashboardSkeleton stats={3} />;
}
