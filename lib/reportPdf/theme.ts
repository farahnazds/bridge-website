// Design tokens for the report PDF, transcribed from the ten templates in
// ./templates. Those templates are the visual spec (docs/12-report-pdf-
// templates.md is still empty, so the markup and its CSS are the source).
//
// ---------------------------------------------------------------------------
// WHY EVERY NUMBER IS CONVERTED, NOT COPIED
// ---------------------------------------------------------------------------
// The templates are HTML and size everything in CSS px. A PDF point is 1/72".
// CSS defines a px as 1/96", so print px -> pt is exactly *0.75. Copying the px
// numbers straight across would render the whole document ~33% too large, and
// the error is uniform enough that it would look "nearly right" rather than
// obviously broken — the worst kind of wrong. `px()` does the conversion once
// and every token below goes through it.
//
// Values are taken from the @media print block where one exists, because that
// is what the templates are actually laid out for. Where print does not
// override, the screen value is used. Both are noted per token.

/** CSS px (1/96") -> PDF points (1/72"). */
export const px = (v: number): number => v * 0.75;

/** mm -> PDF points, for the page box the templates declare. */
export const mm = (v: number): number => (v / 25.4) * 72;

// ---------------------------------------------------------------------------
// Page geometry
// ---------------------------------------------------------------------------
// `@page { size: A4; margin: 0 }` with `.page { width:210mm; height:296mm }`.
// pdfkit's "A4" is 595.28 x 841.89pt (210 x 297mm). The templates use 296mm to
// keep a print engine from spilling onto a second physical sheet; that margin
// of safety is not needed here because we place blocks ourselves, so the true
// A4 height is used and the 1mm is simply unused space at the foot.
export const PAGE = {
  size: "A4" as const,
  width: mm(210),
  height: mm(297),
};

/** `.content { padding: 13px 30px 6px }` (print). */
export const CONTENT_PAD = {
  top: px(13),
  side: px(30),
  bottom: px(6),
};

/** `.header { padding: 18px 34px 16px }` (no print override). */
export const HEADER_PAD = { top: px(18), side: px(34), bottom: px(16) };

/** `.footer { padding: 9px 34px }` (no print override). */
export const FOOTER_PAD = { y: px(9), side: px(34) };

/** Usable width between the content padding. */
export const CONTENT_WIDTH = PAGE.width - CONTENT_PAD.side * 2;

// ---------------------------------------------------------------------------
// Palette — every colour used by the templates, named after its CSS role
// ---------------------------------------------------------------------------
export const COLOR = {
  ink: "#0D1B4C",
  inkSoft: "#23324f",
  body: "#3a4a63",

  muted: "#5B6B8C",
  muted2: "#7987a3",
  muted3: "#9aa5ba",
  muted4: "#8792a8",

  border: "#E4E9F2",
  borderSoft: "#F0F3F8",
  borderDash: "#C7D2E4",
  borderRule: "#D5DBE6",

  blue: "#0057FF",
  teal: "#00B3A6",
  tealDeep: "#00A896",
  tealLight: "#00D9C4",

  amber: "#F5A524",
  amberLight: "#FFC65C",
  amberText: "#E39400",
  amberBadge: "#B8791A",

  red: "#E5484D",
  redLight: "#FF7B7F",

  // Header / darkpanel / summarybar gradient stops.
  navy0: "#081235",
  navy1: "#0D1B4C",
  navy2: "#0A2D8F",
  navy3: "#12276b",

  // Surfaces.
  white: "#ffffff",
  surface0: "#FAFBFD",
  surface1: "#FBFCFE",
  surface2: "#F4F7FC",
  surface3: "#FCFDFE",
  surface4: "#EEF1F6",

  // Precision box is the one warm surface in the system.
  precisionBg: "#FFFBF2",
  precisionBorder: "#F5DFA8",
  precisionText: "#6b5a2e",
  precisionTitle: "#8a6a1a",
} as const;

// ---------------------------------------------------------------------------
// Type scale
// ---------------------------------------------------------------------------
// pdfkit ships Helvetica; the brand faces (General Sans / Inter / JetBrains
// Mono) are not vendored in the repo — see the note in lib/reportPdf.ts and the
// follow-up item in docs/PROJECT-STATUS.md. Sizes and weights below still match
// the templates so that swapping the faces in later is a font-registration
// change and nothing else.
export const FONT = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
  oblique: "Helvetica-Oblique",
  mono: "Courier",
} as const;

export const SIZE = {
  body: px(11),

  h1: px(23),
  headerMeta: px(10.5),
  headerLabel: px(13),
  headerLabelSub: px(8),
  subhead: px(9.5),

  sectionTitle: px(9),

  cardLabel: px(8),
  cardValue: px(15),
  cardValueBig: px(22),
  cardSub: px(8.5),

  table: px(10),
  tableHead: px(8),

  interpTitle: px(10),
  interpBody: px(10),

  precision: px(9.5),
  callout: px(10),
  meansBody: px(10.5),

  badge: px(8),
  footer: px(8),
  citation: px(8.5),

  darkLabel: px(8),
  darkValue: px(19),
  darkSub: px(8.5),

  barLabel: px(8),
  barValue: px(15),
  barValueWide: px(10),

  recItem: px(10),

  rxName: px(11),
  rxDetail: px(9),
  rxCode: px(9.5),
  rxSymbol: px(18),

  chartTitle: px(10),

  dayName: px(8),
  dayTag: px(7),
  dayValue: px(11),
  dayCaption: px(8),

  mealTitle: px(9.5),
  mealMeta: px(9),
  mealNote: px(9),

  missingNote: px(9.5),
  evidence: px(8),

  adLabel: px(7.5),
  adTitle: px(11),
  adSub: px(9),
} as const;

/** `line-height:1.5` on body; pdfkit takes the gap, not the multiple. */
export const LINE_GAP = SIZE.body * 0.5 - SIZE.body * 0.2;

// ---------------------------------------------------------------------------
// Box metrics
// ---------------------------------------------------------------------------
export const RADIUS = {
  sm: px(6),
  md: px(7),
  lg: px(9),
  xl: px(10),
  pill: px(20),
} as const;

/** Padding for each boxed block, from the @media print overrides. */
export const PAD = {
  statusCard: { x: px(12), y: px(9) },
  chartBox: { x: px(12), top: px(9), bottom: px(4) },
  interp: { x: px(12), y: px(8) },
  callout: { x: px(13), y: px(8) },
  meansBox: { x: px(14), y: px(9) },
  precisionBox: { x: px(13), y: px(8) },
  summaryBar: { x: px(18), y: px(10) },
  darkPanel: { x: px(20), y: px(12) },
  rx: { x: px(12), y: px(7) },
  adBanner: { x: px(18), y: px(12) },
  day: { x: px(5), y: px(7) },
  mealHead: { x: px(14), y: px(7) },
  cell: { x: px(8), y: px(3.5) },
  headCell: { x: px(8), y: px(5) },
  missingNote: { x: px(14), y: px(9) },
} as const;

/** Bottom margins, from the @media print overrides. */
export const GAP = {
  statusRow: px(14),
  chartsRow: px(4),
  interp: px(7),
  callout: px(11),
  meansBox: px(11),
  precisionBox: px(7),
  summaryBar: px(7),
  darkPanel: px(9),
  rx: px(11),
  mealBlock: px(8),
  weekstrip: px(10),
  table: px(5),
  recItem: px(5),
  adBanner: px(12),
  missingNote: px(12),
  /** `.section-title { margin:10px 0 6px }` (print). */
  sectionTitleTop: px(10),
  sectionTitleBottom: px(6),
  /** Flex `gap` between siblings in a row. */
  rowGap: px(10),
  chartsGap: px(12),
  twoColGap: px(14),
  dayGap: px(5),
} as const;

export const STROKE = {
  hairline: 0.5,
  rule: px(1),
  sectionRule: px(1.5),
  accentBar: px(3),
} as const;

/** Chart drawing surface: `.chart-svg { height:86px }` under print. */
export const CHART = {
  height: px(86),
  /** Rasterised at 3x the display box so it stays crisp on a 300dpi print. */
  scale: 3,
} as const;

/** Status tone -> accent, matching `.status-card.optimal|attention|flag`. */
export const TONE = {
  optimal: { accent: COLOR.tealDeep, bar: [COLOR.tealLight, COLOR.teal] },
  attention: { accent: COLOR.amberText, bar: [COLOR.amberLight, COLOR.amber] },
  flag: { accent: COLOR.red, bar: [COLOR.redLight, COLOR.red] },
  neutral: { accent: COLOR.ink, bar: [COLOR.borderRule, COLOR.borderRule] },
} as const;

export type Tone = keyof typeof TONE;

/** Badge tone -> [background, text], matching `.badge.green|orange|red|blue|muted`. */
export const BADGE: Record<string, [string, string]> = {
  green: ["#E0F5F3", COLOR.tealDeep],
  orange: ["#FDEFD9", COLOR.amberBadge],
  red: ["#FBE2E3", COLOR.red],
  blue: ["#E0EAFF", COLOR.blue],
  muted: [COLOR.surface4, COLOR.muted2],
};

/** Training-day tag tone -> [background, text], matching `.dt.high|mod|low|rest|match`. */
export const DAY_TAG: Record<string, [string, string]> = {
  high: ["#FBE2E3", COLOR.red],
  mod: ["#E0EAFF", COLOR.blue],
  low: ["#E0F5F3", COLOR.tealDeep],
  rest: [COLOR.surface4, COLOR.muted2],
  match: [COLOR.teal, COLOR.white],
};
