// Shared matching for DATA-ENTRY CSV imports (GPS, VALD, body composition…).
//
// (An athlete-REGISTRATION CSV import also existed until 2026-08-17, removed
// by owner decision. Its matching direction was the INVERSE of this file's:
// there, a code that matched an existing athlete was a DUPLICATE to skip.
// Here, a code that MATCHES is the normal case — that's the athlete the
// reading belongs to — and NO match is the error ("no match found",
// Flow 6 step 4).)
//
// docs/04-user-flows.md Flow 6 step 3 describes this direction ("matches
// each row to an athlete by athlete code (not name — names have
// inconsistent spelling across source systems)"); the registration importer
// was the special case.

export type DataRowStatus = "matched" | "unmatched" | "error";

export interface MatchableAthlete {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
}

export interface MatchedRow<T> {
  rowNumber: number;
  athleteCode: string;
  athleteId: string | null;
  athleteName: string | null;
  date: string;
  status: DataRowStatus;
  message: string | null;
  values: T;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseNum(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseInt10(raw: string | undefined): number | null {
  const n = parseNum(raw);
  if (n === null) return null;
  return Number.isInteger(n) ? n : null;
}

// Validates the two fields every data-entry import shares (athlete code +
// date) and resolves the athlete. Per-import field parsing is supplied by
// the caller via `buildValues`, which may also return its own error string.
export function matchRowsByAthleteCode<T>(
  rawRows: Record<string, string>[],
  athletes: MatchableAthlete[],
  buildValues: (raw: Record<string, string>) => { values: T; error: string | null }
): MatchedRow<T>[] {
  const byCode = new Map(athletes.map((a) => [a.code.toLowerCase(), a]));

  return rawRows.map((raw, i) => {
    const rowNumber = i + 2; // +1 zero-index, +1 header row
    const athleteCode = (raw.athlete_code ?? raw.code ?? "").trim();
    const date = (raw.date ?? "").trim();
    const { values, error: valueError } = buildValues(raw);

    const errors: string[] = [];
    if (!athleteCode) errors.push("missing athlete code");
    if (!date) errors.push("missing date");
    else if (!DATE_RE.test(date)) errors.push(`invalid date "${date}" — use YYYY-MM-DD`);
    if (valueError) errors.push(valueError);

    if (errors.length > 0) {
      return {
        rowNumber,
        athleteCode: athleteCode || "—",
        athleteId: null,
        athleteName: null,
        date,
        status: "error",
        message: errors.join("; "),
        values,
      };
    }

    const athlete = byCode.get(athleteCode.toLowerCase());
    if (!athlete) {
      // Flow 6 step 4: unmatched rows are surfaced with a clear "no match
      // found" message rather than silently dropped.
      return {
        rowNumber,
        athleteCode,
        athleteId: null,
        athleteName: null,
        date,
        status: "unmatched",
        message: `No athlete with code "${athleteCode}" on this team`,
        values,
      };
    }

    return {
      rowNumber,
      athleteCode,
      athleteId: athlete.id,
      athleteName: `${athlete.first_name} ${athlete.last_name}`,
      date,
      status: "matched",
      message: null,
      values,
    };
  });
}
