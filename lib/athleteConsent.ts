// The statement an athlete must accept at activation (/athlete/activate).
//
// The wording is the owner's, verbatim (2026-10-01): factual, not reassurance.
// It is stored WITH each acceptance (athlete_data_handling_acceptances), so the
// evidence is "this person accepted exactly this text at this time" even after
// the wording changes. Changing the text means bumping the version.

export const ATHLETE_DATA_HANDLING_VERSION = "2026-10-01";

// The "[Privacy Policy]" link is rendered separately by the form; this is the
// plain text recorded as evidence.
export const ATHLETE_DATA_HANDLING_TEXT =
  "I understand that my practitioner and club enter, manage, and view my health and performance data as part of their professional records, and that this data remains part of those records even if I close my account. [Privacy Policy]";

// Everything before the link, for rendering.
export const ATHLETE_DATA_HANDLING_LEAD =
  "I understand that my practitioner and club enter, manage, and view my health and performance data as part of their professional records, and that this data remains part of those records even if I close my account.";
