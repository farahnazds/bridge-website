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
