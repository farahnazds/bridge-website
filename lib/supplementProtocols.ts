// Shared vocabulary for supplement_protocols, which migration 035 changed in
// two ways that every reader has to agree on:
//
//   1. An athlete holds SEVERAL active protocols at once — one per supplement.
//      Creatine, iron and omega-3 run concurrently, each superseded on its own
//      timeline. Callers that did `rows.find(r => r.end_date === null)` were
//      correct under migration 020 and are wrong now.
//
//   2. "Active" means the row COVERS a date, not that end_date is null. A
//      day-specific plan sets both dates (creatine for the 20th to the 26th);
//      a standing prescription leaves end_date null. Filtering on
//      `end_date is null` would hide every day-specific row from the athlete
//      for the entire window it is supposed to cover.
//
// Both rules live here rather than being re-derived in each of the four
// surfaces that read this table (Daily Check-In, My Protocol, Athlete Profile,
// the bulk planner), because a surface that gets rule 2 subtly wrong shows an
// athlete the wrong supplements on the wrong day and nothing else catches it.

/** The minimum a row needs for the helpers below. Callers select more. */
export interface ProtocolCoverageRow {
  start_date: string;
  end_date: string | null;
}

/** The minimum a row needs to be identified as "the same supplement". */
export interface ProtocolIdentityRow {
  supplement_library_id?: string | null;
  supplement_name: string;
}

/** Local calendar date as YYYY-MM-DD. ISO date strings compare correctly with
 *  `<` and `>`, which is why every comparison here is a plain string compare. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The supplement identity key, mirroring the SQL expression the exclusion
 * constraint in migration 035 is built on:
 *
 *   coalesce(supplement_library_id::text, 'name:' || lower(btrim(supplement_name)))
 *
 * Kept byte-identical in intent to the database's version. If these two drift,
 * the app will group rows the constraint does not and vice versa — so this is
 * the one place the rule is written in TypeScript.
 */
export function supplementKey(row: ProtocolIdentityRow): string {
  return row.supplement_library_id ?? `name:${row.supplement_name.trim().toLowerCase()}`;
}

/**
 * Where a row sits relative to a date.
 *
 * `scheduled` is new with the bulk planner and is NOT a hidden state: a
 * protocol confirmed for next week has been through the practitioner's
 * confirmation gate and is a real prescription. The athlete should see it, and
 * see that it has not started yet. Only UNCONFIRMED suggestions are withheld,
 * and those never reach this table at all.
 */
export type ProtocolPhase = "active" | "scheduled" | "ended";

export function protocolPhase(row: ProtocolCoverageRow, onDate: string): ProtocolPhase {
  if (row.start_date > onDate) return "scheduled";
  if (row.end_date !== null && row.end_date < onDate) return "ended";
  return "active";
}

/** Rows covering `onDate`. Equivalent to the SQL predicate in migration 035. */
export function activeOn<T extends ProtocolCoverageRow>(rows: T[], onDate: string): T[] {
  return rows.filter((r) => protocolPhase(r, onDate) === "active");
}

export function scheduledAfter<T extends ProtocolCoverageRow>(rows: T[], onDate: string): T[] {
  return rows.filter((r) => protocolPhase(r, onDate) === "scheduled");
}

export function endedBefore<T extends ProtocolCoverageRow>(rows: T[], onDate: string): T[] {
  return rows.filter((r) => protocolPhase(r, onDate) === "ended");
}

/**
 * The same containment rule pushed into PostgREST, for callers that should not
 * fetch an athlete's whole prescription history just to show today's.
 *
 * Structurally typed rather than importing Supabase's builder generics: the
 * filter shape is stable, and tying this to a generated query type would make
 * the helper unusable from a differently-parameterised client.
 */
interface CoverageFilterable {
  lte(column: string, value: string): unknown;
  or(filters: string): unknown;
}
export function coversDate<T extends CoverageFilterable>(query: T, onDate: string): T {
  return (query as { lte(c: string, v: string): T }).lte("start_date", onDate).or(
    `end_date.is.null,end_date.gte.${onDate}`
  ) as T;
}

/**
 * Human phrasing for a row's window, used on every surface that lists
 * protocols so an athlete reads the same sentence everywhere.
 *
 * Deliberately does NOT say "ongoing" for a bounded future range — "20 Aug to
 * 26 Aug" is the whole point of a day-specific plan and hiding the end date
 * would make a seven-day block look permanent.
 */
export function protocolWindowLabel(row: ProtocolCoverageRow, onDate: string): string {
  const phase = protocolPhase(row, onDate);
  if (phase === "scheduled") {
    return row.end_date ? `Starts ${row.start_date}, through ${row.end_date}` : `Starts ${row.start_date}`;
  }
  if (phase === "ended") return `${row.start_date} to ${row.end_date}`;
  return row.end_date ? `${row.start_date} to ${row.end_date}` : `Since ${row.start_date}, ongoing`;
}
