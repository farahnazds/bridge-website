"use client";

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

/** Display labels for the library's category slugs. VALUES always come from
 *  the data — this map only prettifies known slugs for the dropdown, and an
 *  unknown slug falls back to itself rather than being hidden. */
const CATEGORY_LABEL: Record<string, string> = {
  bcaa: "BCAA",
  beta_alanine: "Beta-Alanine",
  caffeine: "Caffeine",
  carbohydrate: "Carbohydrate Fuel",
  collagen: "Collagen",
  creatine: "Creatine",
  electrolytes: "Electrolytes / Hydration",
  glutamine: "Glutamine",
  iron: "Iron",
  magnesium: "Magnesium",
  multivitamin: "Multivitamin",
  nitrate: "Dietary Nitrate",
  omega_3: "Omega-3",
  protein: "Protein",
  sodium_bicarbonate: "Sodium Bicarbonate",
  vitamin_c: "Vitamin C",
  vitamin_d: "Vitamin D",
  zinc_magnesium: "Zinc + Magnesium",
};
const categoryLabel = (slug: string) => CATEGORY_LABEL[slug] ?? slug;

const CUSTOM = "__custom__";

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
  onClose,
}: {
  teamId: string;
  row: ProtocolRow;
  alternatives: CatalogueProductLite[];
  clinical: AthleteClinicalContext | null;
  onClose: () => void;
}) {
  const [state, action] = useActionState(switchProtocolProduct, initialState);
  const [selected, setSelected] = useState<string>("");
  const [dose, setDose] = useState(row.dose);
  const [timing, setTiming] = useState(row.timing);
  const [rationale, setRationale] = useState(row.rationale);
  const codeLabels = clinical?.codeLabels ?? {};

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
}: {
  teamId: string;
  row: ProtocolRow;
  phase: ProtocolPhase;
  today: string;
  canEdit: boolean;
  alternatives: CatalogueProductLite[];
  clinical: AthleteClinicalContext | null;
}) {
  const [open, setOpen] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
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

  return (
    <div
      className={`${PANEL} p-4`}
      style={{
        borderColor: phase === "active" ? "var(--brand-teal)" : "var(--border)",
        backgroundColor: phase === "ended" ? "transparent" : "var(--surface)",
        opacity: phase === "ended" ? 0.7 : 1,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
              {row.supplementName}
            </p>
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
          </div>
          <p className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>
            {row.dose} · {row.timing}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
            {protocolWindowLabel(asCoverage(row), today)}
          </p>
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-3">
            {/* Only meaningful on rows the catalogue has instances of, and
                only while the row is live — an ended prescription's product
                is history, not something to switch. */}
            {alternatives.length > 0 && phase !== "ended" && (
              <button
                type="button"
                onClick={() => { setShowAlternatives(!showAlternatives); setOpen(false); }}
                className="text-xs font-medium underline-offset-2 hover:underline"
                style={{ color: "var(--brand-blue)" }}
              >
                {showAlternatives ? "Close alternatives" : `Alternatives (${alternatives.length})`}
              </button>
            )}
            <button
              type="button"
              onClick={() => { setOpen(!open); setShowAlternatives(false); }}
              className="text-xs font-medium underline-offset-2 hover:underline"
              style={{ color: "var(--brand-blue)" }}
            >
              {open ? "Close" : "Edit"}
            </button>
          </div>
        )}
      </div>

      {row.rationale && !open && !showAlternatives && (
        <p className="mt-2 text-xs leading-snug" style={{ color: "var(--text-muted)" }}>
          {row.rationale}
        </p>
      )}

      {showAlternatives && canEdit && (
        <AlternativesPanel
          teamId={teamId}
          row={row}
          alternatives={alternatives}
          clinical={clinical}
          onClose={() => setShowAlternatives(false)}
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
 * dose → timing → reason, with the athlete's declarations pinned on top and
 * the shared safety check running live on selection.
 *
 * Dose is free text FOR NOW: no structured per-supplement dose presets exist
 * anywhere yet (products carry one label-dosing string each, which is a
 * different thing). When supplement_library grows a real presets field with
 * clinically supplied options, this input becomes a dropdown + custom, same
 * shape as timing below.
 */
function AddProtocolForm({
  teamId,
  athleteId,
  clinical,
  today,
  library,
}: {
  teamId: string;
  athleteId: string;
  clinical: AthleteClinicalContext | null;
  today: string;
  library: SupplementLibraryRow[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createProtocol, initialState);
  const [category, setCategory] = useState("");
  const [libraryId, setLibraryId] = useState("");
  const [timingChoice, setTimingChoice] = useState<string>(SUPPLEMENT_TIMING_OPTIONS[0]);
  const [timingCustom, setTimingCustom] = useState("");
  const [whyChoice, setWhyChoice] = useState<string>("");
  const [whyCustom, setWhyCustom] = useState("");

  // Categories come from the library DATA — never a hardcoded list, so a new
  // clinical entry's category appears here the moment it exists.
  const categories = useMemo(
    () => [...new Set(library.map((s) => s.category))].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b))),
    [library]
  );
  const inCategory = useMemo(
    () => library.filter((s) => s.category === category).sort((a, b) => a.name.localeCompare(b.name)),
    [library, category]
  );
  const entry = library.find((s) => s.id === libraryId) ?? null;
  const findings = useMemo(() => liveFindings(entry, clinical), [entry, clinical]);

  const timing = timingChoice === CUSTOM ? timingCustom : timingChoice;
  const rationale = whyChoice === CUSTOM ? whyCustom : whyChoice;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs font-medium underline-offset-2 hover:underline"
        style={{ color: "var(--brand-blue)" }}
      >
        + Add a supplement
      </button>
    );
  }

  return (
    <form action={action} className={`${PANEL} flex flex-col gap-3 p-4`} style={{ borderColor: "var(--brand-blue)", backgroundColor: "var(--bg)" }}>
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="athlete_id" value={athleteId} />
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
            value={category}
            onChange={(e) => { setCategory(e.target.value); setLibraryId(""); }}
            className={INPUT}
            style={INPUT_STYLE}
            required
          >
            <option value="" disabled>Choose a category…</option>
            {categories.map((c) => (
              <option key={c} value={c}>{categoryLabel(c)}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Supplement</label>
          <select
            name="supplement_library_id"
            value={libraryId}
            onChange={(e) => setLibraryId(e.target.value)}
            className={INPUT}
            style={INPUT_STYLE}
            required
            disabled={!category}
          >
            <option value="" disabled>{category ? "Choose a supplement…" : "Choose a category first"}</option>
            {inCategory.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* The live mismatch check — same checkPlanItems as everywhere else. */}
      <LiveWarnings findings={findings} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Dose</label>
          <input name="dose" placeholder="e.g. 5 g/day" className={INPUT} style={INPUT_STYLE} required />
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
  canEdit,
  preselectedAthleteId,
}: {
  teamId: string;
  today: string;
  data: AthleteProtocols[];
  library: SupplementLibraryRow[];
  products: CatalogueProductLite[];
  canEdit: boolean;
  preselectedAthleteId: string | null;
}) {
  const [athleteFilter, setAthleteFilter] = useState<string>(preselectedAthleteId ?? "all");
  const [showEnded, setShowEnded] = useState(false);

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

  return (
    <div className="flex flex-col gap-6">
      <div
        className={`${CARD} flex flex-wrap items-center justify-between gap-4 p-5`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {totals.active} active · {totals.scheduled} scheduled across {data.length} athlete
            {data.length === 1 ? "" : "s"}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {totals.athletesWithNone === 0
              ? "Every athlete has at least one protocol."
              : `${totals.athletesWithNone} athlete${totals.athletesWithNone === 1 ? " has" : "s have"} nothing active or scheduled.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text)" }}>
            <input
              type="checkbox"
              checked={showEnded}
              onChange={(e) => setShowEnded(e.target.checked)}
              className="h-4 w-4 rounded"
              style={{ accentColor: "var(--brand-blue)" }}
            />
            Show ended
          </label>
        </div>
      </div>

      {visible.map((a) => {
        const withPhase = a.protocols.map((p) => ({ p, phase: protocolPhase(asCoverage(p), today) }));
        const active = withPhase.filter((x) => x.phase === "active");
        const scheduled = withPhase
          .filter((x) => x.phase === "scheduled")
          .sort((x, y) => x.p.startDate.localeCompare(y.p.startDate));
        const ended = withPhase.filter((x) => x.phase === "ended");

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
          />
        );

        return (
          <div
            key={a.athleteId}
            className={`${CARD} flex flex-col gap-4 p-5`}
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            <div>
              <p className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
                {a.name} <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>({a.code})</span>
              </p>
              {/* Always on screen, never behind a disclosure — the same
                  component and the same wording the planner's review grid uses. */}
              <div className="mt-1">
                <ClinicalFlagChips flags={a.flags} />
              </div>
            </div>

            {active.length === 0 && scheduled.length === 0 && (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Nothing active or scheduled.
              </p>
            )}

            {active.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Taking now
                </p>
                {active.map(card)}
              </div>
            )}

            {scheduled.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Scheduled
                </p>
                {scheduled.map(card)}
              </div>
            )}

            {showEnded && ended.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Ended ({ended.length})
                </p>
                {ended.map(card)}
              </div>
            )}
            {!showEnded && ended.length > 0 && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {ended.length} ended prescription{ended.length === 1 ? "" : "s"} kept in history.
              </p>
            )}

            {canEdit && (
              <AddProtocolForm
                teamId={teamId}
                athleteId={a.athleteId}
                clinical={a.clinical}
                today={today}
                library={library}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
