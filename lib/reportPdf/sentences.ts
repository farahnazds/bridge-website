// Sentence segmentation for clinical narrative text.
//
// The previous cap in layouts/common.ts matched `[^.!?]+[.!?]+(\s|$)` — which
// clinical prose defeats constantly: decimals ("11.8%") and abbreviations
// ("approx. 20 g") made segments merge or split wrongly. Measured on a real
// stored report (2026-08-17): a panel "capped to four sentences" still
// rendered 1,008 characters (~11 lines), while another section lost 88% of
// its content to the same cap. This module is the one shared splitter, so the
// cap and the panel point-splitting cannot disagree.
//
// Rules:
// - A boundary is a run of .!? (with optional closing quotes/brackets, in
//   either order) followed by whitespace, where the next run starts like a
//   sentence: an uppercase letter (accented included) or inverted punctuation.
// - "45.2%" never splits — the dot inside a number has no whitespace after it.
// - "approx. 20 g" does not split — "20" does not start like a sentence, so
//   the abbreviation merges into its sentence. The cost is that a genuine
//   sentence starting with a bare number merges too, which reads fine.
// - Accented capitals and ¿¡ are sentence starters, so Spanish narrative
//   segments correctly.

const BOUNDARY = /[.!?]+["')\]]*\s+/g;
const NEXT_STARTS_SENTENCE = /^["'(¿¡]*[A-ZÁÉÍÓÚÜÑ]/;

/** The text split into sentences. Never throws; unsplittable text comes back
 *  as a single trimmed entry (or an empty array for blank input). */
export function splitSentences(text: string): string[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  const out: string[] = [];
  let start = 0;
  BOUNDARY.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BOUNDARY.exec(t))) {
    const end = m.index + m[0].length;
    if (NEXT_STARTS_SENTENCE.test(t.slice(end))) {
      const sentence = t.slice(start, end).trim();
      if (sentence) out.push(sentence);
      start = end;
    }
  }
  const tail = t.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/** First N sentences, joined back into prose. The narrative hard cap. */
export function capSentences(text: string, max: number): string {
  const sentences = splitSentences(text);
  if (sentences.length <= max) return (text ?? "").trim();
  return sentences.slice(0, max).join(" ");
}
