import { CARD } from "@/lib/ui";

// The dashboard loading state, shared by every loading.tsx in the app.
//
// Why these exist at all: every dashboard page is a server component that
// awaits Supabase before it renders anything, and App Router keeps the PREVIOUS
// page painted until the new one is ready. Opening a club is several queries
// over sequential round trips to the Sydney project — measured from a real
// click, the switcher's menu closed after 147ms and the destination appeared
// 3,143ms later, with nothing moving in between. Three seconds of an unchanged
// screen is indistinguishable from a control that doesn't work, which is
// exactly how it was reported.
//
// A loading.tsx turns its segment into a Suspense boundary, so the skeleton
// swaps in on the same frame as the click and the click reads as received.
//
// One component rather than a copy per segment: lib/ui.ts exists because the
// primary button had been written eight slightly different ways, and a
// skeleton drifting per dashboard would be the same mistake — these are seen
// side by side as you move between roles.
//
// Shapes only, never copy. Guessing at headings would flash wrong text for a
// second and then replace it, which is worse than a grey bar.

const BLOCK = "rounded-lg motion-reduce:animate-none animate-pulse";

// A tint of the text colour rather than --surface-raised (#0a1026). That token
// is one step up from --surface (#080d20) — the right call for a nested panel,
// but as a fill it is nearly invisible against the very surfaces a skeleton
// sits on, and animate-pulse halves it twice a second. Screenshotted mid-pulse
// the bars had all but disappeared. This reads on --bg, --surface and
// --surface-raised alike.
const FILL = "color-mix(in srgb, var(--text) 10%, transparent)";

function Bar({ w, h = 14 }: { w: string; h?: number }) {
  return <div className={BLOCK} style={{ width: w, height: h, backgroundColor: FILL }} />;
}

/**
 * The same skeleton plus the dashboard chrome around it — header strip and
 * sidebar rail.
 *
 * Needed when the navigation ENTERS a segment rather than moving inside one.
 * A loading.tsx only covers what sits below its own layout, so the boundary
 * that catches /admin → /club/[clubId] has to live one level up, at
 * app/club — above the club layout, which means above the header and sidebar
 * too. Without these shapes the wait would paint as a bare page on the plain
 * background, which reads as "the app fell over" rather than "it's loading".
 *
 * Mirrors DashboardShell's markup: the 256px rail ≥lg, nothing below it.
 */
export function DashboardSkeleton({ stats = 4, rows = 5 }: { stats?: number; rows?: number }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div
        className="flex flex-none items-center justify-between gap-6"
        style={{
          padding: "14px clamp(16px, 4vw, 32px)",
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--surface)",
        }}
      >
        <Bar w="150px" h={28} />
        <Bar w="112px" h={28} />
      </div>

      <div className="flex min-w-0 flex-1">
        <aside
          className="hidden w-64 flex-shrink-0 flex-col gap-6 px-4 py-6 lg:flex"
          style={{ backgroundColor: "var(--surface)" }}
        >
          <div className="px-2">
            <Bar w="100%" h={42} />
          </div>
          <div className="flex flex-col gap-2 px-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Bar key={i} w={i % 3 === 0 ? "72%" : "88%"} h={16} />
            ))}
          </div>
        </aside>

        <main
          className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8"
          style={{ backgroundColor: "var(--bg)" }}
        >
          <PageSkeleton stats={stats} rows={rows} />
        </main>
      </div>
    </div>
  );
}

export default function PageSkeleton({
  /**
   * The row of stat cards above the content. Every Super Admin page and the
   * club overview open with four; pass 0 for a segment whose pages don't.
   */
  stats = 4,
  /** Rows in the table placeholder below. */
  rows = 5,
}: {
  stats?: number;
  rows?: number;
}) {
  return (
    // aria-busy + a polite status: a screen-reader user is told the page is
    // loading rather than hearing the previous page stay put.
    <div className="flex flex-col gap-8" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="flex flex-col gap-2">
        <Bar w="220px" h={26} />
        <Bar w="360px" h={14} />
      </div>

      {stats > 0 && (
        // Matching the real grids: the club overview lays its three cards out
        // as sm:grid-cols-3, everything else as sm:grid-cols-2 lg:grid-cols-4.
        // A skeleton whose cards are a different width than the ones replacing
        // them makes the page jump on arrival.
        <div
          className={`grid grid-cols-1 gap-4 ${
            stats === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"
          }`}
        >
          {Array.from({ length: stats }, (_, i) => (
            <div
              key={i}
              className={`${CARD} p-5`}
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
            >
              <Bar w="72px" h={12} />
              <div className="mt-2">
                <Bar w="56px" h={24} />
              </div>
              <div className="mt-2">
                <Bar w="104px" h={11} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className={`overflow-hidden ${CARD}`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 px-5 py-3.5"
            style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}
          >
            <Bar w={i === 0 ? "88px" : "168px"} h={13} />
            <Bar w="64px" h={13} />
          </div>
        ))}
      </div>
    </div>
  );
}
