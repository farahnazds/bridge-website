"use client";

import { useActionState, useState } from "react";
import DataModal from "@/components/DataModal";
import VocabularyPicker, { type VocabGroup } from "@/components/VocabularyPicker";
import { saveLibraryEntry, saveProductClinical, type LibraryState } from "@/app/super-admin/supplement-library/actions";
import { CATEGORY_GROUPS, DIET_PREFERENCES } from "@/lib/constants";
import { BTN_PRIMARY, BTN_TERTIARY, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";

// The Supplement Library edit modals (owner-approved design 2026-08-28).
// Safety fields are VocabularyPicker multi-selects over the live reference
// tables — no keyboard path produces a code, and the server actions
// re-validate regardless. Deliberately absent, per the same ruling: delete
// (this UI is singles and corrections; the import script is the bulk path),
// and edits to cultural_notes / ethnicity_dosing_notes (legal-review flag) —
// shown read-only so what exists is visible but untouchable here.

export interface EditableLibraryEntry {
  id: string;
  name: string;
  category: string;
  category_group: string | null;
  evidence_grade: string | null;
  age_min: number | null;
  age_max: number | null;
  contraindicated_conditions: string[];
  diet_compatibility: string[];
  alternatives: string[];
  cultural_notes: string | null;
  ethnicity_dosing_notes: string | null;
}

export interface EditableProductClinical {
  id: string;
  name: string;
  supplement_library_id?: string | null;
  informed_sport?: boolean;
  nsf_certified?: boolean;
  vegan?: boolean;
  allergens?: string[];
  default_dosing?: string | null;
}

export interface EditingContext {
  /** Medical conditions / Allergies / Intolerances, in that order. */
  vocabGroups: VocabGroup[];
  /** The allergies group alone — product allergens draw only from it. */
  allergyGroups: VocabGroup[];
  libraryOptions: { id: string; name: string }[];
}

const initial: LibraryState = { error: null, saved: false };
const DIET_OPTIONS = DIET_PREFERENCES.filter((d) => d.value !== "none");

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{children}</span>;
}

function ReadOnlyNote({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
      <span className="font-medium">{label} (read-only — import-managed): </span>
      {value}
    </p>
  );
}

export function LibraryEntryEditor({
  entry,
  ctx,
}: {
  /** Omitted = the "+ Add library entry" flow. */
  entry?: EditableLibraryEntry;
  ctx: EditingContext;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(saveLibraryEntry, initial);
  // Adjust-during-render (the repo's sanctioned pattern — see DashboardShell):
  // close ONCE per successful save, identified by state identity, so a stale
  // `saved: true` from an earlier save can't slam the modal shut on reopen.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.saved) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={entry ? `${BTN_TERTIARY} !px-2 !py-1 text-xs` : BTN_PRIMARY}
        style={entry ? { color: "var(--brand-blue)" } : { backgroundImage: "var(--brand-gradient-action)" }}
      >
        {entry ? "Edit" : "+ Add library entry"}
      </button>

      {open && (
        <DataModal
          title={entry ? `Edit ${entry.name}` : "Add library entry"}
          subtitle="Contraindications and diets are picked from the live vocabulary — never typed."
          onClose={() => setOpen(false)}
        >
          <form action={action} className="flex flex-col gap-5">
            {entry && <input type="hidden" name="id" value={entry.id} />}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <FieldLabel>Name</FieldLabel>
                <input name="name" required defaultValue={entry?.name ?? ""} className={INPUT} style={INPUT_STYLE} />
              </label>
              <label className="flex flex-col gap-1.5">
                <FieldLabel>Category</FieldLabel>
                <select
                  name="category_group"
                  required
                  defaultValue={entry?.category_group ?? ""}
                  className={`w-full ${INPUT}`}
                  style={INPUT_STYLE}
                >
                  <option value="" disabled>Select a category…</option>
                  {CATEGORY_GROUPS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <FieldLabel>Evidence grade</FieldLabel>
                <select name="evidence_grade" defaultValue={entry?.evidence_grade ?? ""} className={`w-full ${INPUT}`} style={INPUT_STYLE}>
                  <option value="">Not graded</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <FieldLabel>Min age</FieldLabel>
                  <input name="age_min" type="number" min={0} max={100} defaultValue={entry?.age_min ?? ""} className={INPUT} style={INPUT_STYLE} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <FieldLabel>Max age</FieldLabel>
                  <input name="age_max" type="number" min={0} max={100} defaultValue={entry?.age_max ?? ""} className={INPUT} style={INPUT_STYLE} />
                </label>
              </div>
            </div>

            <VocabularyPicker
              name="contraindicated_conditions"
              legend="Contraindicated for"
              groups={ctx.vocabGroups}
              initial={entry?.contraindicated_conditions ?? []}
            />

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium" style={{ color: "var(--text)" }}>Diet compatibility</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {DIET_OPTIONS.map((d) => (
                  <label key={d.value} className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text)" }}>
                    <input
                      type="checkbox"
                      name="diet_compatibility"
                      value={d.value}
                      defaultChecked={(entry?.diet_compatibility ?? []).includes(d.value)}
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium" style={{ color: "var(--text)" }}>Alternatives</legend>
              <div className="max-h-40 overflow-y-auto rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}>
                {ctx.libraryOptions
                  .filter((o) => o.id !== entry?.id)
                  .map((o) => (
                    <label key={o.id} className="flex items-center gap-2 py-1 text-sm" style={{ color: "var(--text)" }}>
                      <input
                        type="checkbox"
                        name="alternatives"
                        value={o.id}
                        defaultChecked={(entry?.alternatives ?? []).includes(o.id)}
                      />
                      {o.name}
                    </label>
                  ))}
              </div>
            </fieldset>

            {entry && (
              <div className="flex flex-col gap-1">
                <ReadOnlyNote label="Cultural notes" value={entry.cultural_notes} />
                <ReadOnlyNote label="Ethnicity dosing notes" value={entry.ethnicity_dosing_notes} />
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Clinical slug: <span style={{ fontFamily: "var(--font-mono)" }}>{entry.category}</span> (identity —
                  read by the planner and reports, not editable here).
                </p>
              </div>
            )}

            {state.error && (
              <p role="alert" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
                {state.error}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button type="submit" className={BTN_PRIMARY} style={{ backgroundImage: "var(--brand-gradient-action)" }}>
                {entry ? "Save entry" : "Add entry"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className={BTN_TERTIARY} style={{ color: "var(--text-muted)" }}>
                Cancel
              </button>
            </div>
          </form>
        </DataModal>
      )}
    </>
  );
}

export function ProductClinicalEditor({
  product,
  ctx,
}: {
  product: EditableProductClinical;
  ctx: EditingContext;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(saveProductClinical, initial);
  // Same adjust-during-render close-on-save as LibraryEntryEditor above.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.saved) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${BTN_TERTIARY} !px-2 !py-1 text-xs`}
        style={{ color: "var(--brand-blue)" }}
      >
        Edit clinical
      </button>

      {open && (
        <DataModal
          title={`Clinical details — ${product.name}`}
          subtitle="Allergens are picked from the allergy vocabulary; the clinical link is the safety check's tie."
          onClose={() => setOpen(false)}
        >
          <form action={action} className="flex flex-col gap-5">
            <input type="hidden" name="product_id" value={product.id} />

            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {([
                ["informed_sport", "Informed Sport", product.informed_sport],
                ["nsf_certified", "NSF Certified for Sport", product.nsf_certified],
                ["vegan", "Vegan", product.vegan],
              ] as const).map(([nameAttr, label, checked]) => (
                <label key={nameAttr} className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text)" }}>
                  <input type="checkbox" name={nameAttr} defaultChecked={Boolean(checked)} />
                  {label}
                </label>
              ))}
            </div>

            <VocabularyPicker
              name="allergens"
              legend="Contains (allergens)"
              groups={ctx.allergyGroups}
              initial={product.allergens ?? []}
            />

            <label className="flex flex-col gap-1.5">
              <FieldLabel>Clinical entry</FieldLabel>
              <select
                name="supplement_library_id"
                defaultValue={product.supplement_library_id ?? ""}
                className={`w-full ${INPUT}`}
                style={INPUT_STYLE}
              >
                <option value="">No clinical link</option>
                {ctx.libraryOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </label>

            {product.default_dosing && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                <span className="font-medium">Dosing (read-only — import-managed): </span>
                {product.default_dosing}
              </p>
            )}

            {state.error && (
              <p role="alert" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
                {state.error}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button type="submit" className={BTN_PRIMARY} style={{ backgroundImage: "var(--brand-gradient-action)" }}>
                Save clinical details
              </button>
              <button type="button" onClick={() => setOpen(false)} className={BTN_TERTIARY} style={{ color: "var(--text-muted)" }}>
                Cancel
              </button>
            </div>
          </form>
        </DataModal>
      )}
    </>
  );
}
