import "server-only";
import { createClient } from "@/lib/supabase/server";

// Resolves the language a report should be generated in.
//
// docs/05-business-rules.md, "Languages": the Club Manager sets a club-wide
// default (club_settings.default_report_language) and a practitioner may
// override it per generation. Before this, every report form submitted a
// hidden language="english" and nothing read the club setting, so the
// selection had no effect.
//
// Resolution happens SERVER-SIDE in each report action rather than only in the
// form, because a server action is independently addressable: a request that
// omits the field, or sends an unsupported value, must still land on the club
// default rather than silently generating in whatever string arrived.

// ARABIC IS PARKED, NOT REMOVED (owner's direction, 2026-08-17): the
// structured PDF renderer cannot render Arabic today — pdfkit's built-in
// Helvetica has no Arabic glyph coverage and pdfkit does no bidi/RTL shaping
// (docs/PROJECT-STATUS.md, "Arabic/RTL") — and zero Arabic reports were ever
// generated. Spanish takes its selector slot until proper RTL support is
// built. Everything Arabic-specific elsewhere stays in place: the
// club_settings default's ('english','arabic') CHECK, the Club Manager
// settings selector, club_branding.arabic_format_notes, and the bilingual-
// output rules in docs/05. A stored 'arabic' club default simply fails
// isSupported() below and resolves to English — the same safe fallback any
// unsupported value has always had.
export const SUPPORTED_LANGUAGES = ["english", "spanish"] as const;
export type ReportLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: ReportLanguage = "english";

function isSupported(value: string): value is ReportLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** The club's configured default, or English if the club has no settings row. */
export async function clubDefaultLanguage(clubId: string | null): Promise<ReportLanguage> {
  if (!clubId) return FALLBACK_LANGUAGE;
  const supabase = await createClient();
  const { data } = await supabase
    .from("club_settings")
    .select("default_report_language")
    .eq("club_id", clubId)
    .maybeSingle();
  const value = (data?.default_report_language as string | undefined) ?? "";
  return isSupported(value) ? value : FALLBACK_LANGUAGE;
}

/** Club id for a team, so an action holding only a teamId can resolve the default. */
export async function clubIdForTeam(teamId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("teams").select("club_id").eq("id", teamId).maybeSingle();
  return (data?.club_id as string | undefined) ?? null;
}

/**
 * What a report action should use.
 *
 * An explicit, supported choice from the practitioner wins. Anything else —
 * missing, blank, or a value outside the supported set — falls back to the
 * club default. Unsupported input is deliberately NOT an error: a report
 * generating in the club's default language is a better outcome than a failed
 * generation, and the form only ever offers valid options.
 */
export async function resolveReportLanguage(
  submitted: string | null | undefined,
  teamId: string
): Promise<ReportLanguage> {
  const choice = (submitted ?? "").trim().toLowerCase();
  if (isSupported(choice)) return choice;
  return clubDefaultLanguage(await clubIdForTeam(teamId));
}
