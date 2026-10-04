// The statement an athlete must accept at activation (/athlete/activate).
//
// The wording is the owner's. It is stored WITH each acceptance
// (athlete_data_handling_acceptances: version + the exact text), so the
// evidence is "this person accepted exactly this text at this time" even after
// the wording changes.
//
// HOW TO CHANGE THE WORDING — never edit a published entry in place:
//   1. Mark the current entry `retired` (add `retiredOn`) and leave its text
//      byte-for-byte as it was. It is the reference for what anyone who
//      accepted that version was shown.
//   2. Add a NEW entry with a NEW version string and `status: "current"`.
//   3. Never re-use a version string. The table is unique on
//      (athlete_id, statement_version) and the RPC does `on conflict do
//      nothing`, so a re-used version with different text would silently keep
//      the OLD text as the evidence. (Exactly one entry may be current — this
//      module throws at load otherwise.)
// Nothing else needs to change: ActivateForm reads the constants exported at the
// bottom, which always follow the current entry, and the database stores
// whatever version/text it is handed.

export interface AthleteDataHandlingStatement {
  /** Never re-used. Date the wording was published. */
  version: string;
  /** The sentence(s) shown beside the checkbox, before the Privacy Policy link. */
  lead: string;
  status: "current" | "retired";
  /** Date this wording stopped being shown (retired entries only). */
  retiredOn?: string;
  /** Why it was replaced — for whoever reads an old acceptance row later. */
  note?: string;
}

/** Every wording ever shown, oldest first. APPEND ONLY. */
export const ATHLETE_DATA_HANDLING_STATEMENTS: readonly AthleteDataHandlingStatement[] = [
  {
    version: "2026-10-01",
    lead:
      "I understand that my practitioner and club enter, manage, and view my health and performance data as part of their professional records, and that this data remains part of those records even if I close my account.",
    status: "retired",
    retiredOn: "2026-10-04",
    note:
      "Written when 'close my account' was a request that only suspended login. Replaced when account deletion shipped (web migration 069): the in-app action is now 'Delete my account', so the old wording no longer matched the button. Substantive meaning unchanged. Zero acceptances had been recorded against this version when it was retired.",
  },
  {
    version: "2026-10-04",
    // PROPOSED, pending the owner's sign-off: the 2026-10-01 sentence with
    // "close" -> "delete" and nothing else changed. If the owner or the lawyer
    // want more said here (e.g. anonymization, the retained copy), that is a
    // further version, not an edit of this one once it has been shown to anyone.
    lead:
      "I understand that my practitioner and club enter, manage, and view my health and performance data as part of their professional records, and that this data remains part of those records even if I delete my account.",
    status: "current",
  },
];

const current = ATHLETE_DATA_HANDLING_STATEMENTS.filter((s) => s.status === "current");
if (current.length !== 1) {
  throw new Error(`athleteConsent: exactly one statement must be current, found ${current.length}`);
}
if (new Set(ATHLETE_DATA_HANDLING_STATEMENTS.map((s) => s.version)).size !== ATHLETE_DATA_HANDLING_STATEMENTS.length) {
  throw new Error("athleteConsent: a statement version is used twice — versions must never be re-used");
}
const CURRENT = current[0];

/** The version recorded with a new acceptance. Always the current wording. */
export const ATHLETE_DATA_HANDLING_VERSION = CURRENT.version;

// The "[Privacy Policy]" link is rendered separately by the form; this is the
// plain text recorded as evidence.
export const ATHLETE_DATA_HANDLING_TEXT = `${CURRENT.lead} [Privacy Policy]`;

// Everything before the link, for rendering.
export const ATHLETE_DATA_HANDLING_LEAD = CURRENT.lead;
