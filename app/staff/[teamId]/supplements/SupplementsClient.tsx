"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { BADGE, BTN_PRIMARY, BTN_SECONDARY, CARD, CHIP, INPUT, INPUT_STYLE, NOTICE, PANEL } from "@/lib/ui";
import ClinicalFlagChips, { type ClinicalFlagsInput } from "@/components/ClinicalFlagChips";
import { protocolPhase, protocolWindowLabel, type ProtocolPhase } from "@/lib/supplementProtocols";
import { SUPPLEMENT_TIMING_OPTIONS, SUPPLEMENT_RATIONALE_OPTIONS } from "@/lib/constants";
import {
  checkPlanItems,
  productAllergenConflicts,
  type AthleteClinicalContext,
  type SupplementLibraryRow,
} from "@/lib/supplementPlanCheck";
import { ageInYears } from "@/app/staff/[teamId]/reports/nutritionPromptBuilder";
import {
  cancelScheduledProtocol,
  createProtocol,
  endProtocolToday,
  switchProtocolProduct,
  updateProtocol,
  type ProtocolActionState,
} from "./actions";

export interface ProtocolRow {
  id: string;
  athleteId: string;
  supplementName: string;
  supplementLibraryId: string | null;
  productId: string | null;
  dose: string;
  timing: string;
  rationale: string;
  startDate: string;
  endDate: string | null;
}

/** A certified product, as an alternative candidate. */
export interface CatalogueProductLite {
  id: string;
  name: string;
  brand: string;
  supplementLibraryId: string;
  informedSport: boolean;
  nsfCertified: boolean;
  /** Declarable allergy codes (milk_dairy, fish, soy…) — displayed via the
   *  athlete's own codeLabels so the chips read as their declarations do. */
  allergens: string[];
  vegan: boolean;
  defaultDosing: string | null;
  /** Label timing split out of default_dosing by migration 045. Canonical
   *  values match SUPPLEMENT_TIMING_OPTIONS and pre-select that option; a
   *  non-canonical value (the Beet It loading protocol) pre-fills the Custom
   *  timing input verbatim. */
  defaultTiming: string | null;
}

export interface AthleteProtocols {
  athleteId: string;
  name: string;
  code: string;
  flags: ClinicalFlagsInput;
  /** Full clinical context for the Add form's banner and live mismatch check.
   *  Null only if the athlete's profile failed to load. */
  clinical: AthleteClinicalContext | null;
  protocols: ProtocolRow[];
}

const initialState: ProtocolActionState = { error: null, safetyMessage: null };

const PHASE_TONE: Record<ProtocolPhase, string> = {
  active: "var(--success)",
  scheduled: "var(--brand-blue)",
  ended: "var(--text-muted)",
};
const PHASE_LABEL: Record<ProtocolPhase, string> = {
  active: "Active",
  scheduled: "Scheduled",
  ended: "Ended",
};

/** The docs/13 section order, used to sort whatever groups the DATA actually
 *  carries — the values themselves always come from category_group, so a new
 *  or renamed group still appears (appended, alphabetically) rather than
 *  being hidden by a stale hardcoded list. */
const GROUP_ORDER = ["Hydration", "Protein", "Performance", "Race Fuel", "Recovery", "Micronutrient"];
const groupRank = (g: string) => {
  const i = GROUP_ORDER.indexOf(g);
  return i === -1 ? GROUP_ORDER.length : i;
};

const CUSTOM = "__custom__";

/** The six docs/13 category groups → their globals.css accent tokens.
 *  Decoration, never the only carrier of meaning — the card names its
 *  supplement and the page carries a legend. Keys are the exact
 *  category_group values from migration 044. */
const CATEGORY_TONE: Record<string, string> = {
  Hydration: "var(--category-hydration)",
  Protein: "var(--category-protein)",
  Performance: "var(--category-performance)",
  "Race Fuel": "var(--category-race-fuel)",
  Recovery: "var(--category-recovery)",
  Micronutrient: "var(--category-micronutrient)",
};

/**
 * The scheduled card's visual of its REAL date range: a lead-in segment from
 * today to the start, then the prescription window, with the two derived
 * facts (days until start, window length) captioned in mono. Deliberately
 * NOT the day-by-day agenda the owner rejected — nothing here is expanded
 * per-day or joined to session data; every pixel derives from start_date,
 * end_date and today. Both sides parse as UTC midnight, so the maths is pure
 * date arithmetic with no local-timezone involvement.
 */
function ScheduleBar({
  startDate,
  endDate,
  today,
  tone,
}: {
  startDate: string;
  endDate: string | null;
  today: string;
  tone: string;
}) {
  const DAY = 86400000;
  const lead = Math.max(1, Math.round((Date.parse(startDate) - Date.parse(today)) / DAY));
  const duration = endDate ? Math.round((Date.parse(endDate) - Date.parse(startDate)) / DAY) + 1 : null;
  // An open-ended row still needs a finite track to draw on; the fade below
  // is what says "no end date", not the track length.
  const total = lead + (duration ?? Math.max(7, Math.round(lead * 0.75)));
  const leadPct = Math.min(88, Math.max(4, (lead / total) * 100));
  return (
    <div className="flex flex-col gap-1">
      <div
        className="relative h-1 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: "color-mix(in srgb, var(--text) 8%, transparent)" }}
      >
        <span
          className="absolute inset-y-0 rounded-full"
          style={{
            left: `${leadPct}%`,
            width: `${100 - leadPct}%`,
            background:
              duration === null
                ? `linear-gradient(90deg, ${tone}, transparent)`
                : tone,
          }}
        />
      </div>
      <div
        className="flex items-baseline justify-between text-[10px]"
        style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em", color: "var(--text-muted)" }}
      >
        <span>starts in {lead} day{lead === 1 ? "" : "s"}</span>
        <span>{duration === null ? "ongoing" : `${duration} day${duration === 1 ? "" : "s"}`}</span>
      </div>
    </div>
  );
}

/** One serialized training-load day for the agenda's rail — flattened from
 *  the planner's loader on the server (Maps don't cross the boundary). */
export interface AgendaLoadDay {
  date: string;
  intensity: string | null;
  sessionType: string | null;
  rpe: number | null;
}

interface AgendaItem {
  row: ProtocolRow;
  /** Dot colour: danger on a live conflict, else category tone, else muted. */
  tone: string;
  altCount: number;
}

interface AgendaDay {
  date: string;
  weekday: string;
  label: string;
  note: string;
  isMatch: boolean;
  items: AgendaItem[];
}

const AGENDA_WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const AGENDA_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The week agenda — the reference's primary scheduled-dates visual: one row
 * per calendar day that has something DUE (active and scheduled rows both;
 * a protocol already running is due tomorrow too), a left rail carrying the
 * day and its training-load session, and one line per protocol occurrence.
 * A range row deliberately repeats across every day it covers — that is the
 * agenda answering "what's due when", while the range cards below keep
 * answering "what protocols exist". Days with nothing due don't appear,
 * exactly as in the reference.
 *
 * Edit/Alternatives here don't host their own forms — they signal the row's
 * range card (the single home of those flows) open and scroll to it, so the
 * agenda can never fork the edit surface.
 */
function WeekAgenda({
  days,
  canEdit,
  onOpen,
}: {
  days: AgendaDay[];
  canEdit: boolean;
  onOpen: (rowId: string, panel: "edit" | "alternatives") => void;
}) {
  if (days.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Nothing due in the next 7 days.
      </p>
    );
  }
  return (
    <div className={`${PANEL} overflow-hidden`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
      {days.map((d, i) => (
        <div
          key={d.date}
          className="grid"
          style={{ gridTemplateColumns: "104px 1fr", borderBottom: i < days.length - 1 ? "1px solid var(--border)" : undefined }}
        >
          <div
            className="flex flex-col gap-0.5 border-r px-3.5 py-3"
            style={{ borderColor: "var(--border)", backgroundColor: "color-mix(in srgb, var(--text) 1.5%, transparent)" }}
          >
            <span
              className="text-[10px]"
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.1em", color: d.isMatch ? "var(--brand-blue)" : "var(--text-muted)" }}
            >
              {d.weekday}
            </span>
            <span
              className="text-[15px] font-semibold"
              style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.01em", color: "var(--text)" }}
            >
              {d.label}
            </span>
            <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>{d.note}</span>
          </div>
          <div className="flex min-w-0 flex-col">
            {d.items.map((it, j) => (
              <div
                key={it.row.id}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3.5 py-2.5"
                style={{
                  borderBottom:
                    j < d.items.length - 1 ? "1px solid color-mix(in srgb, var(--border) 55%, transparent)" : undefined,
                }}
              >
                <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ backgroundColor: it.tone }} />
                <span className="min-w-0 text-[13px] font-semibold" style={{ color: "var(--text)", flex: "1 1 150px" }}>
                  {it.row.supplementName}
                </span>
                <span className="min-w-0 text-xs" style={{ color: "var(--text-muted)", flex: "1 1 auto" }}>{it.row.dose}</span>
                <span
                  className="min-w-0 text-[9.5px]"
                  style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}
                >
                  {it.row.timing}
                </span>
                {canEdit && (
                  <span className="ml-auto flex shrink-0 items-center gap-3">
                    {it.altCount > 0 && (
                      <button
                        type="button"
                        onClick={() => onOpen(it.row.id, "alternatives")}
                        className="text-[11.5px] font-medium underline-offset-2 hover:underline"
                        style={{ color: "var(--brand-blue)" }}
                      >
                        Alternatives ({it.altCount})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpen(it.row.id, "edit")}
                      className={`${PANEL} px-2.5 py-1 text-[11.5px] font-medium transition-colors duration-150 ease-out hover:border-white/25`}
                      style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                    >
                      Edit
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The mockup's section marker: small dot, mono label, hairline to the edge.
 *  Flat dot rather than the mockup's halo — docs/06: no box-shadows. */
function SectionHead({ tone, outlined, label }: { tone: string; outlined?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={outlined ? { border: `1.5px solid ${tone}` } : { backgroundColor: tone }}
      />
      <span
        className="text-[10px] font-medium"
        style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.18em", color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <span className="h-px flex-1" style={{ backgroundColor: "var(--border)" }} />
    </div>
  );
}

/** The coverage helpers take snake_case rows; the client works in camelCase. */
function asCoverage(p: ProtocolRow) {
  return { start_date: p.startDate, end_date: p.endDate };
}

function SubmitButton({ label, busyLabel, danger }: { label: string; busyLabel: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={danger ? BTN_SECONDARY : BTN_PRIMARY}
      style={
        danger
          ? { borderColor: "var(--danger)", color: "var(--danger)" }
          : { backgroundImage: "var(--brand-gradient-action)" }
      }
    >
      {pending ? busyLabel : label}
    </button>
  );
}

function ActionNotices({ state }: { state: ProtocolActionState }) {
  return (
    <>
      {/* A safety finding is clinical context, not a system failure, so it is
          presented in the danger colour but with an explanatory frame rather
          than as a bare error string. Same distinction the planner draws. */}
      {state.safetyMessage && (
        <p
          role="alert"
          className={NOTICE}
          style={{
            borderColor: "var(--danger)",
            color: "var(--text)",
            backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
          }}
        >
          <strong style={{ color: "var(--danger)" }}>Blocked by the safety check.</strong>{" "}
          {state.safetyMessage}
        </p>
      )}
      {state.error && (
        <p
          role="alert"
          className={NOTICE}
          style={{
            borderColor: "var(--danger)",
            color: "var(--danger)",
            backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
          }}
        >
          {state.error}
        </p>
      )}
    </>
  );
}

/**
 * The real-time mismatch check for a chosen library entry, run in the browser.
 *
 * EXPLICIT REUSE, not a second safety check: this calls the same
 * checkPlanItems() the planner runs at generation and confirm and the server
 * actions here run before every write — one function, one set of codes, one
 * age rule. The client run is advisory (it warns the moment a supplement is
 * chosen); the server run remains the gate that actually blocks.
 */
function liveFindings(
  entry: SupplementLibraryRow | null,
  clinical: AthleteClinicalContext | null
): string[] {
  if (!entry || !clinical) return [];
  const result = checkPlanItems(
    [
      {
        athleteId: clinical.athleteId,
        date: null,
        supplementName: entry.name,
        supplementLibraryId: entry.id,
        // Dose and timing play no part in the structural check; placeholders
        // keep the item shape honest without pretending a dose was chosen.
        dose: "-",
        timing: "-",
        rationale: "",
      },
    ],
    new Map([[clinical.athleteId, clinical]]),
    [entry]
  );
  return result.findings.map((f) =>
    f.reason === "contraindicated"
      ? `Conflicts with declared ${f.conflictingLabels.join(", ")}.`
      : `This supplement is ${f.reason}.`
  );
}

/** The athlete's declared context, always visible at the top of the Add form
 *  and the alternatives panel — the practitioner should never be choosing
 *  from memory. */
function SafetyBanner({ clinical }: { clinical: AthleteClinicalContext | null }) {
  if (!clinical) {
    return (
      <p className={NOTICE} style={{ borderColor: "var(--warning)", color: "var(--text)", backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)" }}>
        This athlete&apos;s clinical profile couldn&apos;t be loaded, so declarations can&apos;t be shown
        here — check their profile before prescribing.
      </p>
    );
  }
  const age = ageInYears(clinical.dob);
  const line = (label: string, values: string[]) => (
    <span>
      <span style={{ color: "var(--text-muted)" }}>{label}: </span>
      {values.length > 0 ? values.join(", ") : "none declared"}
    </span>
  );
  return (
    <div
      className={`${PANEL} flex flex-col gap-1 px-3 py-2 text-xs`}
      style={{ borderColor: "var(--brand-blue)", backgroundColor: "color-mix(in srgb, var(--brand-blue) 6%, transparent)", color: "var(--text)" }}
    >
      <p className="font-medium">
        {clinical.firstName} {clinical.lastName} — {age !== null ? `age ${age}` : "date of birth not recorded"}
      </p>
      {line("Allergies", clinical.allergies)}
      {line("Intolerances", clinical.intolerances)}
      {line("Conditions", clinical.conditions)}
    </div>
  );
}

function LiveWarnings({ findings }: { findings: string[] }) {
  if (findings.length === 0) return null;
  return (
    <div
      role="alert"
      className={NOTICE}
      style={{
        borderColor: "var(--danger)",
        color: "var(--text)",
        backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
      }}
    >
      <strong style={{ color: "var(--danger)" }}>
        This choice fails the safety check for this athlete.
      </strong>
      <ul className="mt-1 list-disc pl-5">
        {findings.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        Saving will be blocked by the same check on the server.
      </p>
    </div>
  );
}

/** Cert/diet/allergen chips for one alternative product. */
function ProductBadges({ p, codeLabels }: { p: CatalogueProductLite; codeLabels: Record<string, string> }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {p.informedSport && (
        <span className={BADGE} style={{ backgroundColor: "color-mix(in srgb, var(--brand-teal) 14%, transparent)", color: "var(--brand-teal)" }}>
          Informed Sport
        </span>
      )}
      {p.nsfCertified && (
        <span className={BADGE} style={{ backgroundColor: "color-mix(in srgb, var(--brand-blue) 14%, transparent)", color: "var(--brand-blue)" }}>
          NSF
        </span>
      )}
      {p.vegan && (
        <span className={CHIP} style={{ backgroundColor: "var(--bg)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
          Vegan
        </span>
      )}
      {p.allergens.map((a) => (
        <span key={a} className={BADGE} style={{ backgroundColor: "color-mix(in srgb, var(--warning) 12%, transparent)", color: "var(--warning)" }}>
          Contains {codeLabels[a] ?? a}
        </span>
      ))}
    </span>
  );
}

/**
 * The Alternatives panel: certified products sharing this row's clinical
 * entity. Switching keeps dose/timing/rationale (prefilled, editable) and
 * runs the shared safety gate server-side — see switchProtocolProduct.
 */
function AlternativesPanel({
  teamId,
  row,
  alternatives,
  clinical,
  allergenLabels,
  onClose,
}: {
  teamId: string;
  row: ProtocolRow;
  alternatives: CatalogueProductLite[];
  clinical: AthleteClinicalContext | null;
  allergenLabels: Record<string, string>;
  onClose: () => void;
}) {
  const [state, action] = useActionState(switchProtocolProduct, initialState);
  const [selected, setSelected] = useState<string>("");
  const [dose, setDose] = useState(row.dose);
  const [timing, setTiming] = useState(row.timing);
  const [rationale, setRationale] = useState(row.rationale);
  // Vocabulary labels first, the athlete's own declaration labels (which can
  // carry an "other" note) over them — so every chip reads as a human label,
  // declared or not.
  const codeLabels = { ...allergenLabels, ...(clinical?.codeLabels ?? {}) };

  // The product half of the structural check, live — same pure function the
  // server action enforces with, run the moment a product is picked.
  const selectedProduct = alternatives.find((p) => p.id === selected) ?? null;
  const productConflicts =
    selectedProduct && clinical ? productAllergenConflicts(selectedProduct.allergens, clinical) : [];

  return (
    <form
      action={action}
      className={`${PANEL} mt-3 flex flex-col gap-3 p-3`}
      style={{ borderColor: "var(--brand-blue)", backgroundColor: "var(--bg)" }}
    >
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="protocol_id" value={row.id} />

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium" style={{ color: "var(--text)" }}>
          Certified alternatives — same supplement, different product
        </p>
        <button type="button" onClick={onClose} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Close
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {alternatives.map((p) => (
          <label
            key={p.id}
            className={`${PANEL} flex cursor-pointer items-start gap-2 px-3 py-2`}
            style={{
              borderColor: selected === p.id ? "var(--brand-blue)" : "var(--border)",
              backgroundColor: selected === p.id ? "color-mix(in srgb, var(--brand-blue) 8%, transparent)" : "var(--surface)",
            }}
          >
            <input
              type="radio"
              name="product_id"
              value={p.id}
              checked={selected === p.id}
              onChange={() => setSelected(p.id)}
              className="mt-1"
              required
            />
            <span className="flex min-w-0 flex-col gap-1 text-xs" style={{ color: "var(--text)" }}>
              <span className="font-medium">
                {p.name} <span style={{ color: "var(--text-muted)" }}>— {p.brand}</span>
              </span>
              <ProductBadges p={p} codeLabels={codeLabels} />
              {p.defaultDosing && (
                <span style={{ color: "var(--text-muted)" }}>Label dosing: {p.defaultDosing}</span>
              )}
            </span>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Dose (kept unless you change it)</label>
          <input name="dose" value={dose} onChange={(e) => setDose(e.target.value)} className={INPUT} style={INPUT_STYLE} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Timing (kept unless you change it)</label>
          <input name="timing" value={timing} onChange={(e) => setTiming(e.target.value)} className={INPUT} style={INPUT_STYLE} required />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Reason (kept unless you change it)</label>
        <textarea name="rationale" rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} className={INPUT} style={{ ...INPUT_STYLE, lineHeight: 1.45 }} />
      </div>

      {productConflicts.length > 0 && (
        <div
          role="alert"
          className={NOTICE}
          style={{
            borderColor: "var(--danger)",
            color: "var(--text)",
            backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
          }}
        >
          <strong style={{ color: "var(--danger)" }}>This product fails the safety check.</strong>{" "}
          It contains {productConflicts.join(", ")}, which this athlete has declared. Switching will
          be blocked by the same check on the server — pick another product of the same supplement.
        </div>
      )}

      <ActionNotices state={state} />
      <div className="flex items-center gap-3">
        <SubmitButton label="Switch product" busyLabel="Switching…" />
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          The clinical entry stays the same, so the entity check is unchanged — and each product&apos;s
          own allergens are checked structurally against the declarations, here and on the server.
        </p>
      </div>
    </form>
  );
}

/** One protocol, with its editor and alternatives. */
function ProtocolCard({
  teamId,
  row,
  phase,
  today,
  canEdit,
  alternatives,
  clinical,
  allergenLabels,
  categoryGroup,
  defaultWhyOpen,
  conflictLabels,
  agendaOpenNonce,
  agendaOpenPanel,
}: {
  teamId: string;
  row: ProtocolRow;
  phase: ProtocolPhase;
  today: string;
  canEdit: boolean;
  alternatives: CatalogueProductLite[];
  clinical: AthleteClinicalContext | null;
  allergenLabels: Record<string, string>;
  /** The row's broad docs/13 category group, resolved from its clinical
   *  entity — null for planner-written rows with no library entry. */
  categoryGroup: string | null;
  /** The page-level "Show rationale" toggle; a card's own peek click overrides it. */
  defaultWhyOpen: boolean;
  /** Conflict labels from the page-level live safety recomputation — the same
   *  shared checks the server gates run, re-evaluated against CURRENT
   *  declarations, so a declaration that changed after prescribing surfaces
   *  here on the affected row itself. Empty = nothing flagged. */
  conflictLabels: string[];
  /** Set (with a fresh nonce) when the week agenda asks this card to open its
   *  editor or alternatives — the agenda holds no forms of its own. */
  agendaOpenNonce?: number;
  agendaOpenPanel?: "edit" | "alternatives";
}) {
  // Which panel is open is DERIVED, not synced: the user's last explicit
  // choice (recorded with the agenda nonce it was made under) wins until the
  // agenda sends a NEW nonce, at which point the agenda's requested panel
  // wins until the next click. No effect, no state mirroring.
  const [manualPanel, setManualPanel] = useState<{
    panel: "edit" | "alternatives" | null;
    asOfNonce: number | undefined;
  }>({ panel: null, asOfNonce: undefined });
  const activePanel =
    agendaOpenNonce !== undefined && manualPanel.asOfNonce !== agendaOpenNonce
      ? agendaOpenPanel ?? "edit"
      : manualPanel.panel;
  const open = activePanel === "edit";
  const showAlternatives = activePanel === "alternatives";
  const choosePanel = (panel: "edit" | "alternatives" | null) =>
    setManualPanel({ panel, asOfNonce: agendaOpenNonce });

  const [whyOverride, setWhyOverride] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState(false);
  const whyOpen = whyOverride ?? defaultWhyOpen;
  const [dose, setDose] = useState(row.dose);
  const [timing, setTiming] = useState(row.timing);
  const [startDate, setStartDate] = useState(row.startDate);
  const [endDate, setEndDate] = useState(row.endDate ?? "");
  const [rationale, setRationale] = useState(row.rationale);

  const [updateState, updateAction] = useActionState(updateProtocol, initialState);
  const [endState, endAction] = useActionState(endProtocolToday, initialState);
  const [cancelState, cancelAction] = useActionState(cancelScheduledProtocol, initialState);

  // Same staleness rule the planner's review grid uses: a changed prescription
  // with an untouched reason is worth a second look, because the reason is what
  // the athlete reads on My Protocol.
  const prescriptionEdited =
    dose !== row.dose || timing !== row.timing || startDate !== row.startDate || (endDate || null) !== row.endDate;
  const rationaleStale = (dose !== row.dose || timing !== row.timing) && rationale === row.rationale;

  // The left accent edge, in priority order: a live SAFETY state always beats
  // the category colour — a conflict edge is danger red and a
  // no-library-entry edge is warning amber, which is exactly why the
  // --category-* palette contains neither hue. Category tone next; a
  // library-linked row with NO group (Sodium Bicarbonate) gets a neutral
  // muted edge, deliberately NOT the phase tone — the scheduled phase blue
  // is the same hue as the Protein category token, and an uncategorised row
  // must not masquerade as a categorised one.
  const categoryTone = categoryGroup ? CATEGORY_TONE[categoryGroup] : undefined;
  const edge =
    conflictLabels.length > 0
      ? "var(--danger)"
      : row.supplementLibraryId === null
        ? "var(--warning)"
        : categoryTone ?? "var(--text-muted)";

  const whyPeek = row.rationale ? `${row.rationale.split(/[.;]/)[0].slice(0, 64).trim()}…` : "";

  // Hover: the whole frame brightens to a vivid version of whatever colour
  // the left edge already carries — category, or a safety state, which this
  // deliberately follows rather than overrides. Nothing happens to the fill
  // or interior; the transition-colors on the card is the whole animation.
  const hoverEdge = `color-mix(in srgb, ${edge} 82%, white)`;

  return (
    <div
      id={`protocol-${row.id}`}
      className={`${PANEL} flex flex-col gap-2.5 p-4 transition-colors duration-200 ease-out`}
      style={{
        borderColor: hovered ? hoverEdge : "var(--border)",
        borderLeftWidth: 2,
        borderLeftColor: hovered ? hoverEdge : edge,
        backgroundColor: phase === "ended" ? "transparent" : "var(--surface)",
        opacity: phase === "ended" ? 0.7 : 1,
        // A card with its editor or alternatives open takes the whole grid
        // row — the forms need width, not a 330px column.
        gridColumn: open || showAlternatives ? "1 / -1" : undefined,
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p
            className="text-sm font-semibold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: "-0.01em" }}
          >
            {row.supplementName}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={BADGE}
              style={{
                backgroundColor: `color-mix(in srgb, ${PHASE_TONE[phase]} 12%, transparent)`,
                color: PHASE_TONE[phase],
              }}
            >
              {PHASE_LABEL[phase]}
            </span>
            {row.supplementLibraryId === null && (
              <span className={BADGE} style={{ backgroundColor: "color-mix(in srgb, var(--warning) 10%, transparent)", color: "var(--warning)" }}>
                Not in library
              </span>
            )}
            {conflictLabels.length > 0 && (
              <span className={BADGE} style={{ backgroundColor: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }}>
                Conflicts with declared {conflictLabels.join(", ")}
              </span>
            )}
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => choosePanel(open ? null : "edit")}
            className={`${PANEL} shrink-0 px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out hover:border-white/25`}
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            {open ? "Close" : "Edit"}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <p
          className="text-base font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: "-0.01em" }}
        >
          {row.dose}
        </p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {row.timing}
        </p>
      </div>

      {phase === "scheduled" && (
        <ScheduleBar
          startDate={row.startDate}
          endDate={row.endDate}
          today={today}
          tone={categoryTone ?? "var(--brand-blue)"}
        />
      )}

      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5"
        style={{ borderColor: "var(--border)" }}
      >
        <p
          className="text-[11px]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}
        >
          {protocolWindowLabel(asCoverage(row), today)}
        </p>
        {/* Only meaningful on rows the catalogue has instances of, and only
            while the row is live — an ended prescription's product is
            history, not something to switch. */}
        {canEdit && alternatives.length > 0 && phase !== "ended" && (
          <button
            type="button"
            onClick={() => choosePanel(showAlternatives ? null : "alternatives")}
            className="text-xs font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--brand-blue)" }}
          >
            {showAlternatives ? "Close alternatives" : `Alternatives (${alternatives.length})`}
          </button>
        )}
      </div>

      {row.rationale && !open && !showAlternatives && (
        whyOpen ? (
          <p
            className={`${PANEL} m-0 cursor-pointer px-3 py-2.5 text-xs leading-relaxed`}
            style={{ borderColor: "var(--border)", backgroundColor: "color-mix(in srgb, var(--text) 3%, transparent)", color: "var(--text-muted)" }}
            onClick={() => setWhyOverride(false)}
          >
            {row.rationale}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setWhyOverride(true)}
            className="self-start text-left text-xs transition-colors duration-150 ease-out"
            style={{ color: "var(--text-muted)" }}
          >
            Why this — {whyPeek}
          </button>
        )
      )}

      {showAlternatives && canEdit && (
        <AlternativesPanel
          teamId={teamId}
          row={row}
          alternatives={alternatives}
          clinical={clinical}
          allergenLabels={allergenLabels}
          onClose={() => choosePanel(null)}
        />
      )}

      {open && canEdit && (
        <div className="mt-4 flex flex-col gap-4">
          <form action={updateAction} className="flex flex-col gap-3">
            <input type="hidden" name="team_id" value={teamId} />
            <input type="hidden" name="protocol_id" value={row.id} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Dose</label>
                <input name="dose" value={dose} onChange={(e) => setDose(e.target.value)} className={INPUT} style={INPUT_STYLE} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Timing</label>
                <input name="timing" value={timing} onChange={(e) => setTiming(e.target.value)} className={INPUT} style={INPUT_STYLE} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Starts</label>
                <input type="date" name="start_date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={INPUT} style={INPUT_STYLE} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Ends</label>
                <input type="date" name="end_date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={INPUT} style={INPUT_STYLE} />
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Leave empty for an ongoing prescription with no end date.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Reason</label>
              {rationaleStale && (
                <p
                  role="status"
                  className="rounded px-2 py-1 text-[11px] leading-snug"
                  style={{ color: "var(--text)", backgroundColor: "color-mix(in srgb, var(--warning) 12%, transparent)" }}
                >
                  You changed the dose or timing — this reason still describes the original. Worth
                  updating if it no longer fits.
                </p>
              )}
              <textarea
                name="rationale"
                rows={3}
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Why this athlete is taking this…"
                className={INPUT}
                style={{ ...INPUT_STYLE, lineHeight: 1.45 }}
              />
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                The athlete reads this on My Protocol under &ldquo;Why you&apos;re taking this&rdquo;.
              </p>
            </div>

            <ActionNotices state={updateState} />
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton label="Save changes" busyLabel="Saving…" />
              {prescriptionEdited && (
                <button
                  type="button"
                  onClick={() => {
                    setDose(row.dose); setTiming(row.timing); setStartDate(row.startDate);
                    setEndDate(row.endDate ?? ""); setRationale(row.rationale);
                  }}
                  className="text-xs font-medium underline-offset-2 hover:underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Discard changes
                </button>
              )}
            </div>
          </form>

          {/* End / Cancel are separate forms so a half-finished edit above
              cannot be submitted along with them. */}
          {phase === "active" && (
            <form action={endAction} className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <input type="hidden" name="team_id" value={teamId} />
              <input type="hidden" name="protocol_id" value={row.id} />
              <ActionNotices state={endState} />
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton label="End today" busyLabel="Ending…" danger />
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Today is the last day; it drops off the athlete&apos;s check-in tomorrow. The row stays in
                  their history.
                </p>
              </div>
            </form>
          )}

          {phase === "scheduled" && (
            <form action={cancelAction} className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <input type="hidden" name="team_id" value={teamId} />
              <input type="hidden" name="protocol_id" value={row.id} />
              <ActionNotices state={cancelState} />
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton label="Cancel this protocol" busyLabel="Cancelling…" danger />
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  It hasn&apos;t started, so there is nothing to keep — this removes it. Once it starts it can
                  only be ended.
                </p>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The Add form, rebuilt 2026-08-15 as library-only (the "Not in the library"
 * free-text path is gone — see createProtocol). Flow: category → supplement →
 * PRODUCT → dose → timing → reason, with the athlete's declarations pinned on
 * top and the shared safety check running live on selection.
 *
 * The category dropdown is the BROAD docs/13 section (category_group,
 * migration 044), not the narrow clinical slug — six groups with the specific
 * supplements nested under them, exactly how the catalogue itself is
 * organised. An entry with NO group (currently only Sodium Bicarbonate, which
 * predates the certified catalogue) is not offered here at all; its history
 * and safety codes are untouched.
 *
 * The PRODUCT step is REQUIRED: a prescription names the certified SKU the
 * athlete actually picks up, not just the clinical entity — the same cards,
 * badges and live allergen check the Alternatives switch uses, so the two
 * flows cannot drift. (The first library-only rebuild shipped without this
 * step; product attachment then existed only as a post-hoc Alternatives
 * switch, leaving hand-added rows product-less.) Every offered entity has at
 * least one certified product, so requiring one never dead-ends a choice.
 *
 * Dose and timing presets come from the CHOSEN product's own label data
 * (default_dosing / default_timing, split clean by migration 045), with the
 * Custom escape hatch. A canonical default_timing pre-selects that vocabulary
 * option; the non-canonical one (Beet It's loading protocol) pre-fills the
 * Custom input verbatim. Nothing is invented: absent label data falls back to
 * free text / the practitioner's own choice.
 */
function AddProtocolForm({
  teamId,
  athleteId,
  clinical,
  today,
  library,
  productsByLibrary,
  allergenLabels,
}: {
  teamId: string;
  athleteId: string;
  clinical: AthleteClinicalContext | null;
  today: string;
  library: SupplementLibraryRow[];
  productsByLibrary: Map<string, CatalogueProductLite[]>;
  allergenLabels: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createProtocol, initialState);
  const [group, setGroup] = useState("");
  const [libraryId, setLibraryId] = useState("");
  const [productId, setProductId] = useState("");
  const [doseChoice, setDoseChoice] = useState("");
  const [doseCustom, setDoseCustom] = useState("");
  const [timingChoice, setTimingChoice] = useState<string>(SUPPLEMENT_TIMING_OPTIONS[0]);
  const [timingCustom, setTimingCustom] = useState("");
  const [whyChoice, setWhyChoice] = useState<string>("");
  const [whyCustom, setWhyCustom] = useState("");

  // Groups come from the library DATA — never a hardcoded value list, so a
  // newly grouped clinical entry appears here the moment it exists. NULL-group
  // entries are the deliberate exclusion: not offered for new prescriptions.
  const offered = useMemo(() => library.filter((s) => s.categoryGroup !== null), [library]);
  const groups = useMemo(
    () =>
      [...new Set(offered.map((s) => s.categoryGroup as string))].sort(
        (a, b) => groupRank(a) - groupRank(b) || a.localeCompare(b)
      ),
    [offered]
  );
  const inGroup = useMemo(
    () => offered.filter((s) => s.categoryGroup === group).sort((a, b) => a.name.localeCompare(b.name)),
    [offered, group]
  );
  const entry = library.find((s) => s.id === libraryId) ?? null;
  const findings = useMemo(() => liveFindings(entry, clinical), [entry, clinical]);

  // The chosen entity's certified products — the required third step.
  const entityProducts = useMemo(
    () =>
      (libraryId ? productsByLibrary.get(libraryId) ?? [] : [])
        .slice()
        .sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name)),
    [libraryId, productsByLibrary]
  );
  const product = entityProducts.find((p) => p.id === productId) ?? null;

  // The product half of the live structural check — same pure function the
  // server action enforces with, run the moment a product is picked.
  const productConflicts = product && clinical ? productAllergenConflicts(product.allergens, clinical) : [];

  const resetSelection = () => {
    setProductId("");
    setDoseChoice("");
  };
  const chooseProduct = (p: CatalogueProductLite) => {
    setProductId(p.id);
    // The product's own label data becomes the starting point, still fully
    // editable: its dosing is pre-selected, and its timing pre-selects the
    // canonical option or pre-fills Custom verbatim (the Beet It loaders).
    setDoseChoice(p.defaultDosing ? p.defaultDosing : CUSTOM);
    if (p.defaultTiming) {
      if ((SUPPLEMENT_TIMING_OPTIONS as readonly string[]).includes(p.defaultTiming)) {
        setTimingChoice(p.defaultTiming);
      } else {
        setTimingChoice(CUSTOM);
        setTimingCustom(p.defaultTiming);
      }
    }
  };

  const doseOptions = product?.defaultDosing ? [product.defaultDosing] : [];
  const dose = doseOptions.length === 0 || doseChoice === CUSTOM ? doseCustom : doseChoice;
  const timing = timingChoice === CUSTOM ? timingCustom : timingChoice;
  const rationale = whyChoice === CUSTOM ? whyCustom : whyChoice;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${BTN_SECONDARY} self-start text-xs`}
        style={{ borderColor: "var(--border)", color: "var(--text)" }}
      >
        + Add a supplement
      </button>
    );
  }

  return (
    <form action={action} className={`${PANEL} flex flex-col gap-3 p-4`} style={{ borderColor: "var(--brand-blue)", backgroundColor: "var(--bg)" }}>
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="athlete_id" value={athleteId} />
      <input type="hidden" name="dose" value={dose} />
      <input type="hidden" name="timing" value={timing} />
      <input type="hidden" name="rationale" value={rationale} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Add a supplement</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Close
        </button>
      </div>

      {/* Always visible, before anything is chosen — the declarations the
          check enforces, in front of the person choosing. */}
      <SafetyBanner clinical={clinical} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Category</label>
          <select
            value={group}
            onChange={(e) => { setGroup(e.target.value); setLibraryId(""); resetSelection(); }}
            className={INPUT}
            style={INPUT_STYLE}
            required
          >
            <option value="" disabled>Choose a category…</option>
            {groups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Supplement</label>
          <select
            name="supplement_library_id"
            value={libraryId}
            onChange={(e) => { setLibraryId(e.target.value); resetSelection(); }}
            className={INPUT}
            style={INPUT_STYLE}
            required
            disabled={!group}
          >
            <option value="" disabled>{group ? "Choose a supplement…" : "Choose a category first"}</option>
            {inGroup.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* The live mismatch check — same checkPlanItems as everywhere else. */}
      <LiveWarnings findings={findings} />

      {/* The required product step — same cards, badges and radio pattern as
          the Alternatives panel, so choosing a product reads identically in
          both flows. */}
      {libraryId && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Product — the certified item the athlete actually picks up
          </p>
          {entityProducts.map((p) => (
            <label
              key={p.id}
              className={`${PANEL} flex cursor-pointer items-start gap-2 px-3 py-2`}
              style={{
                borderColor: productId === p.id ? "var(--brand-blue)" : "var(--border)",
                backgroundColor: productId === p.id ? "color-mix(in srgb, var(--brand-blue) 8%, transparent)" : "var(--surface)",
              }}
            >
              <input
                type="radio"
                name="product_id"
                value={p.id}
                checked={productId === p.id}
                onChange={() => chooseProduct(p)}
                className="mt-1"
                required
              />
              <span className="flex min-w-0 flex-col gap-1 text-xs" style={{ color: "var(--text)" }}>
                <span className="font-medium">
                  {p.name} <span style={{ color: "var(--text-muted)" }}>— {p.brand}</span>
                </span>
                <ProductBadges p={p} codeLabels={{ ...allergenLabels, ...(clinical?.codeLabels ?? {}) }} />
                {p.defaultDosing && (
                  <span style={{ color: "var(--text-muted)" }}>Label dosing: {p.defaultDosing}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}

      {productConflicts.length > 0 && (
        <div
          role="alert"
          className={NOTICE}
          style={{
            borderColor: "var(--danger)",
            color: "var(--text)",
            backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
          }}
        >
          <strong style={{ color: "var(--danger)" }}>This product fails the safety check.</strong>{" "}
          It contains {productConflicts.join(", ")}, which this athlete has declared. Saving will be
          blocked by the same check on the server — pick another product of the same supplement.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Dose</label>
          {doseOptions.length > 0 ? (
            <>
              <select
                value={doseChoice}
                onChange={(e) => setDoseChoice(e.target.value)}
                className={INPUT}
                style={INPUT_STYLE}
                required
              >
                <option value="" disabled>Choose a dose…</option>
                {doseOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
                <option value={CUSTOM}>Custom…</option>
              </select>
              {doseChoice === CUSTOM && (
                <input
                  value={doseCustom}
                  onChange={(e) => setDoseCustom(e.target.value)}
                  placeholder="e.g. 5 g/day"
                  className={INPUT}
                  style={INPUT_STYLE}
                  required
                />
              )}
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                This product&apos;s label dosing.
              </p>
            </>
          ) : (
            <input
              value={doseCustom}
              onChange={(e) => setDoseCustom(e.target.value)}
              placeholder={productId ? "e.g. 5 g/day" : "Choose a product first"}
              className={INPUT}
              style={INPUT_STYLE}
              required
            />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>When to use</label>
          <select value={timingChoice} onChange={(e) => setTimingChoice(e.target.value)} className={INPUT} style={INPUT_STYLE}>
            {SUPPLEMENT_TIMING_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
            <option value={CUSTOM}>Custom…</option>
          </select>
          {timingChoice === CUSTOM && (
            <input
              value={timingCustom}
              onChange={(e) => setTimingCustom(e.target.value)}
              placeholder="Describe the timing…"
              className={INPUT}
              style={INPUT_STYLE}
              required
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Why</label>
        <select value={whyChoice} onChange={(e) => setWhyChoice(e.target.value)} className={INPUT} style={INPUT_STYLE} required>
          <option value="" disabled>Choose a reason…</option>
          {SUPPLEMENT_RATIONALE_OPTIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
          <option value={CUSTOM}>Custom reason…</option>
        </select>
        {whyChoice === CUSTOM && (
          <textarea
            value={whyCustom}
            onChange={(e) => setWhyCustom(e.target.value)}
            rows={2}
            placeholder="Why this athlete is taking this…"
            className={INPUT}
            style={{ ...INPUT_STYLE, lineHeight: 1.45 }}
            required
          />
        )}
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          The athlete reads this on My Protocol under &ldquo;Why you&apos;re taking this&rdquo;.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Starts</label>
          <input type="date" name="start_date" defaultValue={today} className={INPUT} style={INPUT_STYLE} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Ends (optional)</label>
          <input type="date" name="end_date" className={INPUT} style={INPUT_STYLE} />
        </div>
      </div>

      <ActionNotices state={state} />
      <SubmitButton label="Add protocol" busyLabel="Adding…" />
    </form>
  );
}

export default function SupplementsClient({
  teamId,
  today,
  data,
  library,
  products,
  allergenLabels,
  agendaLoads,
  canEdit,
  preselectedAthleteId,
}: {
  teamId: string;
  today: string;
  data: AthleteProtocols[];
  library: SupplementLibraryRow[];
  products: CatalogueProductLite[];
  /** code → human label for the FULL allergy vocabulary, so product chips can
   *  name allergens the athlete hasn't declared. Athlete-declared labels
   *  (which can carry an "other" note) still win where both exist. */
  allergenLabels: Record<string, string>;
  /** Per-athlete training-load days for the agenda rail, today → +6. */
  agendaLoads: Record<string, AgendaLoadDay[]>;
  canEdit: boolean;
  preselectedAthleteId: string | null;
}) {
  const [athleteFilter, setAthleteFilter] = useState<string>(preselectedAthleteId ?? "all");
  /** Phase filter pills — "ended" is where the old "Show ended" checkbox's
   *  history view lives now; every state it could reach is still reachable. */
  const [phaseFilter, setPhaseFilter] = useState<"all" | "active" | "scheduled" | "ended">("all");
  const [allWhy, setAllWhy] = useState(false);

  const visible = useMemo(
    () => (athleteFilter === "all" ? data : data.filter((a) => a.athleteId === athleteFilter)),
    [data, athleteFilter]
  );

  // Certified products grouped by clinical entity, once — every card's
  // "Alternatives (N)" derives from this.
  const productsByLibrary = useMemo(() => {
    const by = new Map<string, CatalogueProductLite[]>();
    for (const p of products) {
      const list = by.get(p.supplementLibraryId);
      if (list) list.push(p);
      else by.set(p.supplementLibraryId, [p]);
    }
    return by;
  }, [products]);

  const alternativesFor = (row: ProtocolRow): CatalogueProductLite[] => {
    if (!row.supplementLibraryId) return [];
    return (productsByLibrary.get(row.supplementLibraryId) ?? []).filter((p) => p.id !== row.productId);
  };

  // Counted across the WHOLE roster, not the filtered view — the summary is
  // there to tell you the state of the team, and would be misleading if it
  // silently followed the filter.
  const totals = useMemo(() => {
    let active = 0, scheduled = 0, athletesWithNone = 0;
    for (const a of data) {
      const act = a.protocols.filter((p) => protocolPhase(asCoverage(p), today) === "active").length;
      const sch = a.protocols.filter((p) => protocolPhase(asCoverage(p), today) === "scheduled").length;
      active += act;
      scheduled += sch;
      if (act === 0 && sch === 0) athletesWithNone++;
    }
    return { active, scheduled, athletesWithNone };
  }, [data, today]);

  // Live (not-ended) rows written by the planner without a clinical library
  // entry — the "needs a product match" number.
  const notInLibrary = useMemo(
    () =>
      data.reduce(
        (n, a) =>
          n +
          a.protocols.filter(
            (p) => p.supplementLibraryId === null && protocolPhase(asCoverage(p), today) !== "ended"
          ).length,
        0
      ),
    [data, today]
  );

  /**
   * The LIVE safety recomputation behind the "Safety conflicts" stat.
   *
   * Genuinely live by construction, never cached and never approximate: the
   * page is a server component that re-reads declarations and protocol rows
   * on every request (and every action revalidates the path), and this memo
   * re-runs the SAME pure checks the server gates enforce with —
   * checkPlanItems for entity contraindications and age bounds,
   * productAllergenConflicts for the attached product — against exactly those
   * fresh props. Nothing here is a second opinion or a heuristic; it is the
   * gate's own functions pointed at what is already prescribed, which is the
   * one case the save-time gates cannot cover: a declaration that CHANGED
   * after the row was written.
   *
   * Ended rows are excluded — history is history — and each finding carries
   * its row id so the stat can link straight to the affected card.
   */
  const safetyFindings = useMemo(() => {
    const productById = new Map(products.map((p) => [p.id, p]));
    const findings: {
      rowId: string;
      athleteId: string;
      athleteName: string;
      supplementName: string;
      labels: string[];
    }[] = [];
    for (const a of data) {
      if (!a.clinical) continue;
      const live = a.protocols.filter((p) => protocolPhase(asCoverage(p), today) !== "ended");
      if (live.length === 0) continue;
      const result = checkPlanItems(
        live.map((p) => ({
          athleteId: a.athleteId,
          date: null,
          supplementName: p.supplementName,
          supplementLibraryId: p.supplementLibraryId,
          dose: p.dose,
          timing: p.timing,
          rationale: p.rationale,
        })),
        new Map([[a.athleteId, a.clinical]]),
        library
      );
      live.forEach((p, i) => {
        const labels = new Set<string>();
        for (const f of result.findings) {
          if (f.supplementName === p.supplementName && result.unsafeIndexes.has(i)) {
            f.conflictingLabels.forEach((l) => labels.add(l));
            if (f.conflictingLabels.length === 0) labels.add(f.reason);
          }
        }
        const product = p.productId ? productById.get(p.productId) : undefined;
        if (product && a.clinical) {
          productAllergenConflicts(product.allergens, a.clinical).forEach((l) => labels.add(l));
        }
        if (labels.size > 0) {
          findings.push({
            rowId: p.id,
            athleteId: a.athleteId,
            athleteName: a.name,
            supplementName: p.supplementName,
            labels: [...labels],
          });
        }
      });
    }
    return findings;
  }, [data, products, library, today]);

  const conflictsByRow = useMemo(
    () => new Map(safetyFindings.map((f) => [f.rowId, f.labels])),
    [safetyFindings]
  );

  const groupByLibraryId = useMemo(
    () => new Map(library.map((s) => [s.id, s.categoryGroup])),
    [library]
  );

  /** Jump from the stat card to the affected row: clear any filter that
   *  would hide it, then scroll once the row is in the DOM. */
  const jumpToRow = (rowId: string, athleteId: string) => {
    setAthleteFilter(athleteId);
    setPhaseFilter("all");
    setTimeout(() => {
      document.getElementById(`protocol-${rowId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  };

  /** An agenda line's Edit/Alternatives: the row's range card is the single
   *  home of those flows, so signal it open, make sure no phase filter hides
   *  it, and bring it into view. */
  const [agendaTarget, setAgendaTarget] = useState<{
    rowId: string;
    panel: "edit" | "alternatives";
    nonce: number;
  } | null>(null);
  const openFromAgenda = (rowId: string, panel: "edit" | "alternatives") => {
    setPhaseFilter("all");
    setAgendaTarget({ rowId, panel, nonce: Date.now() });
    setTimeout(() => {
      document.getElementById(`protocol-${rowId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };

  const stats: { label: string; value: number; tone: string; sub: string }[] = [
    {
      label: "TAKING NOW",
      value: totals.active,
      tone: "var(--success)",
      sub: `across ${data.length} athlete${data.length === 1 ? "" : "s"}${
        totals.athletesWithNone > 0 ? ` · ${totals.athletesWithNone} with none` : ""
      }`,
    },
    { label: "SCHEDULED", value: totals.scheduled, tone: "var(--text)", sub: "queued to start" },
    {
      label: "NOT IN LIBRARY",
      value: notInLibrary,
      tone: notInLibrary > 0 ? "var(--warning)" : "var(--text)",
      sub: notInLibrary > 0 ? "needs a product match" : "every live row has a clinical entry",
    },
    {
      label: "SAFETY CONFLICTS",
      value: safetyFindings.length,
      tone: safetyFindings.length > 0 ? "var(--danger)" : "var(--text)",
      // "flagged", deliberately not "cleared" — this is a passive
      // recomputation against current declarations, not a completed review.
      sub: `${safetyFindings.length} flagged — checked now against current declarations`,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {stats.map((s) => (
          <div
            key={s.label}
            className={`${CARD} flex flex-col gap-1 px-4 py-3.5`}
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            <span
              className="text-[9px] font-medium"
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em", color: "var(--text-muted)" }}
            >
              {s.label}
            </span>
            <span
              className="text-2xl font-semibold"
              style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.02em", color: s.tone }}
            >
              {s.value}
            </span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{s.sub}</span>
            {s.label === "SAFETY CONFLICTS" && safetyFindings.length > 0 && (
              <div className="mt-1 flex flex-col items-start gap-1">
                {safetyFindings.map((f) => (
                  <button
                    key={f.rowId}
                    type="button"
                    onClick={() => jumpToRow(f.rowId, f.athleteId)}
                    className="text-left text-[11px] font-medium underline-offset-2 hover:underline"
                    style={{ color: "var(--danger)" }}
                  >
                    {f.athleteName} — {f.supplementName}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Where protocols come FROM — the planner remains the front door; this
          page is oversight and quick edits. Shown to editors only. */}
      {canEdit && (
        <div
          className={`${CARD} flex flex-wrap items-center gap-4 px-5 py-3.5`}
          style={{
            borderColor: "var(--border)",
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--brand-teal) 7%, var(--surface)), color-mix(in srgb, var(--brand-blue-deep) 6%, var(--surface)) 55%, var(--surface))",
          }}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              Protocols are built in the Nutrition Planner
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Set doses against the week&apos;s sessions there — they appear here for review and quick edits.
            </p>
          </div>
          <Link
            href={`/staff/${teamId}/supplements/planner`}
            className={`${BTN_PRIMARY} ml-auto shrink-0`}
            style={{ backgroundImage: "var(--brand-gradient-action)" }}
          >
            Nutrition Planner →
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <select
          value={athleteFilter}
          onChange={(e) => setAthleteFilter(e.target.value)}
          className={INPUT}
          style={{ ...INPUT_STYLE, width: "auto" }}
          aria-label="Filter by athlete"
        >
          <option value="all">All athletes</option>
          {data.map((a) => (
            <option key={a.athleteId} value={a.athleteId}>{a.name}</option>
          ))}
        </select>
        {(
          [
            ["all", "All"],
            ["active", "Taking now"],
            ["scheduled", "Scheduled"],
            ["ended", "Ended"],
          ] as const
        ).map(([key, label]) => {
          const on = phaseFilter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPhaseFilter(key)}
              className={`${PANEL} px-3.5 py-2 text-xs transition-colors duration-150 ease-out ${on ? "font-semibold" : "hover:border-white/25"}`}
              style={
                on
                  ? {
                      borderColor: "color-mix(in srgb, var(--success) 45%, transparent)",
                      backgroundColor: "color-mix(in srgb, var(--success) 13%, transparent)",
                      color: "var(--success)",
                    }
                  : { borderColor: "var(--border)", color: "var(--text-muted)" }
              }
            >
              {label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setAllWhy(!allWhy)}
          className={`${PANEL} ml-auto px-3.5 py-2 text-xs transition-colors duration-150 ease-out hover:border-white/25`}
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          {allWhy ? "Hide rationale" : "Show rationale"}
        </button>
      </div>

      {/* The key to the cards' left edges. The colours are decoration — the
          card names its supplement — but a legend keeps them readable rather
          than a private code. Safety states (red, amber) outrank these on
          any card that carries one. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-0.5">
        {Object.entries(CATEGORY_TONE).map(([label, tone]) => (
          <span
            key={label}
            className="flex items-center gap-1.5 text-[9px]"
            style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.12em", color: "var(--text-muted)" }}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tone }} />
            {label.toUpperCase()}
          </span>
        ))}
      </div>

      {visible.map((a) => {
        const withPhase = a.protocols.map((p) => ({ p, phase: protocolPhase(asCoverage(p), today) }));
        const active = withPhase.filter((x) => x.phase === "active");
        const scheduled = withPhase
          .filter((x) => x.phase === "scheduled")
          .sort((x, y) => x.p.startDate.localeCompare(y.p.startDate));
        const ended = withPhase.filter((x) => x.phase === "ended");

        const showActive = (phaseFilter === "all" || phaseFilter === "active") && active.length > 0;
        const showScheduled = (phaseFilter === "all" || phaseFilter === "scheduled") && scheduled.length > 0;
        const showEndedSection = phaseFilter === "ended" && ended.length > 0;

        // The agenda: today → +6, one entry per day a protocol is DUE — a row
        // occurs on day D when startDate <= D <= (endDate ?? forever), so
        // active and scheduled rows both appear and ended rows fall out
        // naturally. Rail notes come from the athlete's resolved training
        // load; a day with no entry says "No plan entry" — the honest data
        // state, never an invented rest day.
        const loadByDate = new Map((agendaLoads[a.athleteId] ?? []).map((l) => [l.date, l]));
        const agendaDays: AgendaDay[] = [];
        for (let i = 0; i < 7; i++) {
          const date = new Date(Date.parse(today) + i * 86400000).toISOString().slice(0, 10);
          const items: AgendaItem[] = a.protocols
            .filter((p) => p.startDate <= date && (p.endDate === null || p.endDate >= date))
            .map((p) => ({
              row: p,
              tone: conflictsByRow.has(p.id)
                ? "var(--danger)"
                : (p.supplementLibraryId ? CATEGORY_TONE[groupByLibraryId.get(p.supplementLibraryId) ?? ""] : undefined) ??
                  "var(--text-muted)",
              altCount: alternativesFor(p).length,
            }));
          if (items.length === 0) continue;
          const load = loadByDate.get(date);
          const hasSession = Boolean(load && (load.sessionType || load.intensity || load.rpe !== null));
          const sessionName = load?.sessionType ?? load?.intensity ?? "Session";
          agendaDays.push({
            date,
            weekday: AGENDA_WEEKDAY.format(new Date(Date.parse(date))).toUpperCase(),
            label: AGENDA_DATE.format(new Date(Date.parse(date))),
            note: hasSession ? `${capitalise(sessionName)}${load?.rpe !== null && load?.rpe !== undefined ? ` · RPE ${load.rpe}` : ""}` : "No plan entry",
            isMatch: (load?.sessionType ?? "").toLowerCase().includes("match"),
            items,
          });
        }

        const card = ({ p, phase }: { p: ProtocolRow; phase: ProtocolPhase }) => (
          <ProtocolCard
            key={p.id}
            teamId={teamId}
            row={p}
            phase={phase}
            today={today}
            canEdit={canEdit}
            alternatives={alternativesFor(p)}
            clinical={a.clinical}
            allergenLabels={allergenLabels}
            categoryGroup={
              p.supplementLibraryId ? groupByLibraryId.get(p.supplementLibraryId) ?? null : null
            }
            defaultWhyOpen={allWhy}
            conflictLabels={conflictsByRow.get(p.id) ?? []}
            agendaOpenNonce={agendaTarget?.rowId === p.id ? agendaTarget.nonce : undefined}
            agendaOpenPanel={agendaTarget?.rowId === p.id ? agendaTarget.panel : undefined}
          />
        );
        const grid = (items: { p: ProtocolRow; phase: ProtocolPhase }[]) => (
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))" }}>
            {items.map(card)}
          </div>
        );

        return (
          <div
            key={a.athleteId}
            className={`${CARD} flex flex-col gap-4 p-5`}
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            <div
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 border-b pb-3"
              style={{ borderColor: "var(--border)" }}
            >
              <p
                className="text-base font-semibold"
                style={{ fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: "-0.015em" }}
              >
                {a.name}
              </p>
              <span
                className="text-[10px]"
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.12em", color: "var(--text-muted)" }}
              >
                {a.code}
              </span>
              {/* Always on screen, never behind a disclosure — the same
                  component and the same wording the planner's review grid uses. */}
              <ClinicalFlagChips flags={a.flags} />
              <span className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>
                {active.length} active · {scheduled.length} scheduled
              </span>
            </div>

            {/* The agenda is the PRIMARY view — what's due when — with the
                range cards kept below it, still answering what protocols
                exist. Hidden only under the Ended filter, where nothing can
                be due. */}
            {phaseFilter !== "ended" && (
              <div className="flex flex-col gap-2.5">
                <SectionHead tone="var(--brand-blue)" label="DUE — NEXT 7 DAYS" />
                <WeekAgenda days={agendaDays} canEdit={canEdit} onOpen={openFromAgenda} />
              </div>
            )}

            {phaseFilter !== "ended" && active.length === 0 && scheduled.length === 0 && (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Nothing active or scheduled.
              </p>
            )}
            {phaseFilter === "ended" && ended.length === 0 && (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No ended prescriptions.
              </p>
            )}

            {showActive && (
              <div className="flex flex-col gap-2.5">
                <SectionHead tone="var(--success)" label="TAKING NOW" />
                {grid(active)}
              </div>
            )}

            {showScheduled && (
              <div className="flex flex-col gap-2.5">
                <SectionHead tone="var(--text-muted)" outlined label="SCHEDULED" />
                {grid(scheduled)}
              </div>
            )}

            {showEndedSection && (
              <div className="flex flex-col gap-2.5">
                <SectionHead tone="var(--text-muted)" outlined label={`ENDED (${ended.length})`} />
                {grid(ended)}
              </div>
            )}
            {phaseFilter !== "ended" && ended.length > 0 && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {ended.length} ended prescription{ended.length === 1 ? "" : "s"} kept in history — see the Ended filter.
              </p>
            )}

            {canEdit && (
              <AddProtocolForm
                teamId={teamId}
                athleteId={a.athleteId}
                clinical={a.clinical}
                today={today}
                library={library}
                productsByLibrary={productsByLibrary}
                allergenLabels={allergenLabels}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
