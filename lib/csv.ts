import Papa from "papaparse";

// Shared CSV parsing for the reusable bulk-import pattern (docs/04-user-flows.md
// Flow 6) — used by every CSV import type (athletes now; GPS/body composition/
// VALD later follow the same shape). Headers are normalized to snake_case so
// template files can use human-friendly column names ("First Name") while
// import code always works with predictable keys ("first_name").
export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
  error: string | null;
}

export function parseCsvText(text: string): CsvParseResult {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
    transform: (v) => v.trim(),
  });

  if (result.errors.length > 0) {
    return { headers: [], rows: [], error: result.errors[0].message };
  }

  return { headers: result.meta.fields ?? [], rows: result.data, error: null };
}
