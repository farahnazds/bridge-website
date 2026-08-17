// The "## Report language" block every prompt builder embeds.
//
// Deliberately pure (no server imports) — the six builders are pure modules.
//
// WHY HEADINGS STAY ENGLISH: the report language steers the AI NARRATIVE
// only. Every structural element of the rendered document — the header band,
// section titles, status-card labels, table headings, the footer — is a
// hardcoded English string in lib/reportPdf/*, and the narrative parser
// (lib/reportPdf/narrative.ts) routes sections into their layout slots by
// matching ENGLISH heading synonyms. A model that translated its headings
// would still render, but its summary/recommendations/monitoring prose would
// collapse into generic interpretation panels. Until the renderer itself is
// localised, the honest output is English structure with the narrative prose
// in the selected language — and this block says so explicitly.
export function reportLanguageBlock(language: string): string {
  if (language === "english") return "english";
  return `${language}

Write ALL narrative prose in ${language}. Keep the SECTION HEADINGS of the required structure in English, exactly as specified above — the renderer identifies sections by their English names, and the document's structural labels are English. Keep figures, units, dates, and supplement/product names exactly as they appear in the data.`;
}
