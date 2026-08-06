// Pure validation logic for the athlete CSV import, shared between the
// preview action and the confirm action (confirm re-validates from scratch
// rather than trusting client-supplied status labels — see actions.ts).
// Kept separate from actions.ts so the validation rules are easy to review
// against docs/04-user-flows.md Flow 6 and docs/10-athlete-data-fields.md
// without wading through the Server Action / DB-call code.

import { generateAthleteCode } from "@/lib/athleteCode";

export const GENDERS = ["male", "female"];
export const TIERS = ["development", "performance", "elite"];
export const DIET_PREFERENCES = ["none", "halal", "vegetarian", "vegan", "kosher", "gluten_free"];

export type RowStatus = "new" | "duplicate" | "error";

export interface ParsedAthleteRow {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  code: string;
  codeWasGenerated: boolean;
  teamName: string;
  teamId: string | null;
  sport: string;
  position: string | null;
  tier: string | null;
  dob: string | null;
  gender: string | null;
  dietPreference: string;
  status: RowStatus;
  message: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateAthleteRows(
  rawRows: Record<string, string>[],
  teams: { id: string; name: string }[],
  existingCodes: Map<string, string> // lowercased code -> existing athlete display name
): ParsedAthleteRow[] {
  const teamByLowerName = new Map(teams.map((t) => [t.name.toLowerCase(), t]));
  const codesSeenInBatch = new Map<string, number>(); // lowercased code -> row number that first used it

  return rawRows.map((raw, i) => {
    const rowNumber = i + 2; // +1 for 0-index, +1 for the header row
    const firstName = (raw.first_name ?? "").trim();
    const lastName = (raw.last_name ?? "").trim();
    const email = (raw.email ?? "").trim().toLowerCase();
    const teamName = (raw.team ?? "").trim();
    const sport = (raw.sport ?? "").trim();
    const position = (raw.position ?? "").trim() || null;
    const dob = (raw.dob ?? "").trim() || null;
    const genderRaw = (raw.gender ?? "").trim().toLowerCase() || null;
    const tierRaw = (raw.tier ?? "").trim().toLowerCase() || null;
    const dietRaw = (raw.diet_preference ?? "").trim().toLowerCase() || "none";
    let code = (raw.code ?? "").trim();
    let codeWasGenerated = false;

    const errors: string[] = [];
    if (!firstName) errors.push("missing first name");
    if (!lastName) errors.push("missing last name");
    if (!email) errors.push("missing email");
    else if (!EMAIL_RE.test(email)) errors.push("invalid email");
    if (!sport) errors.push("missing sport");
    if (!teamName) errors.push("missing team");

    const team = teamName ? teamByLowerName.get(teamName.toLowerCase()) : undefined;
    if (teamName && !team) errors.push(`team "${teamName}" not found — create it in Teams & Staff first`);

    if (genderRaw && !GENDERS.includes(genderRaw)) errors.push(`invalid gender "${genderRaw}"`);
    if (tierRaw && !TIERS.includes(tierRaw)) errors.push(`invalid tier "${tierRaw}"`);
    if (dietRaw && !DIET_PREFERENCES.includes(dietRaw)) errors.push(`invalid diet preference "${dietRaw}"`);
    if (dob && !DATE_RE.test(dob)) errors.push(`invalid date of birth "${dob}" — use YYYY-MM-DD`);

    if (errors.length > 0) {
      return {
        rowNumber,
        firstName,
        lastName,
        email,
        code: code || "—",
        codeWasGenerated: false,
        teamName,
        teamId: team?.id ?? null,
        sport,
        position,
        tier: tierRaw,
        dob,
        gender: genderRaw,
        dietPreference: dietRaw,
        status: "error",
        message: errors.join("; "),
      };
    }

    if (!code) {
      code = generateAthleteCode(lastName);
      codeWasGenerated = true;
      // Extremely unlikely, but guard against colliding with another
      // auto-generated code earlier in the same batch.
      while (codesSeenInBatch.has(code.toLowerCase()) || existingCodes.has(code.toLowerCase())) {
        code = generateAthleteCode(lastName);
      }
    }

    const codeLower = code.toLowerCase();
    const existingName = existingCodes.get(codeLower);
    const duplicateInBatchRow = codesSeenInBatch.get(codeLower);

    if (existingName) {
      return {
        rowNumber,
        firstName,
        lastName,
        email,
        code,
        codeWasGenerated,
        teamName,
        teamId: team!.id,
        sport,
        position,
        tier: tierRaw,
        dob,
        gender: genderRaw,
        dietPreference: dietRaw,
        status: "duplicate",
        message: `Code already registered to ${existingName}`,
      };
    }

    if (duplicateInBatchRow) {
      return {
        rowNumber,
        firstName,
        lastName,
        email,
        code,
        codeWasGenerated,
        teamName,
        teamId: team!.id,
        sport,
        position,
        tier: tierRaw,
        dob,
        gender: genderRaw,
        dietPreference: dietRaw,
        status: "error",
        message: `Duplicate code within this file — already used by row ${duplicateInBatchRow}`,
      };
    }

    codesSeenInBatch.set(codeLower, rowNumber);

    return {
      rowNumber,
      firstName,
      lastName,
      email,
      code,
      codeWasGenerated,
      teamName,
      teamId: team!.id,
      sport,
      position,
      tier: tierRaw,
      dob,
      gender: genderRaw,
      dietPreference: dietRaw,
      status: "new",
      message: null,
    };
  });
}
