// The Roster's shared shape: types and tuning constants, and nothing that
// touches Supabase or next/headers.
//
// Split out of lib/rosterOverview.ts because RosterClient.tsx is a client
// component and needs SPARK_DAYS / TREND_DAYS as VALUES (they appear in column
// headers and copy). Importing them from the loader dragged
// lib/supabase/server.ts — and therefore next/headers — into the browser
// bundle, which fails the build outright.
//
// Same reason lib/complianceThresholds.ts is kept free of Supabase: a module
// that holds pure decisions can be used from either side of the boundary.

/** Days of check-in history behind the sparkline. Two weeks reads as a habit
 *  without becoming a chart. */
export const SPARK_DAYS = 14;

/** The headline compliance window, and the span the delta compares against. */
export const TREND_DAYS = 7;

/** The recency window behind the Check-In Notes and Missed Supplement filter
 *  chips: today minus 4 through today, inclusive. An athlete drops off those
 *  filters automatically after the fifth day; the underlying check-in stays
 *  in their history untouched. */
export const RECENT_DAYS = 5;

/** Derived from RTP phase, never stored — see the note in rosterOverview.ts. */
export type Availability = "available" | "modified" | "rehab";

export interface RosterRow {
  id: string;
  firstName: string;
  lastName: string;
  code: string;
  position: string | null;
  /** Today's check-in status, or null when nothing has been logged yet. */
  todayStatus: string | null;
  /** Oldest-first, exactly SPARK_DAYS long. null = no row logged that day. */
  spark: { date: string; status: string | null }[];
  /** Completed / total over the last TREND_DAYS, as a percentage. */
  complianceRate: number | null;
  availability: Availability;
  /** True when the club's own alert thresholds are breached. */
  flagged: boolean;
  /** Why it is flagged, for the row's tooltip. Empty when not flagged. */
  flagReasons: string[];
  /** The MOST RECENT check-in note within the last RECENT_DAYS, or null.
   *  Carries the text so the Check-In Notes filter can show WHY the athlete
   *  is listed, not just that they are. */
  recentNote: { date: string; text: string } | null;
  /** Every injury still open (injuries.status != 'cleared'), no time limit —
   *  the Active Injury filter's detail: what it is and the expected RTP. */
  openInjuries: {
    type: string | null;
    status: string;
    rtpPhase: string | null;
    targetReturnDate: string | null;
  }[];
  /** Supplements recorded short of a confirmed "taken" within the last
   *  RECENT_DAYS — one entry per supplement, its most recent non-taken state
   *  ("missed" or "unsure"; "unsure" counts by the 2026-08-16 ruling). */
  missedSupplements: { name: string; state: "missed" | "unsure"; date: string }[];
}

export interface RosterOverview {
  rows: RosterRow[];
  today: string;
  checkedInToday: number;
  /** Squad average over the last TREND_DAYS. */
  complianceRate: number | null;
  /** Percentage-point change against the preceding TREND_DAYS. null when
   *  there is no prior window to compare against — never rendered as 0. */
  complianceDelta: number | null;
  flaggedCount: number;
  rehabCount: number;
  error: string | null;
}
