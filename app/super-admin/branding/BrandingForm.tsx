"use client";

import { useActionState, useState } from "react";
import { BTN_PRIMARY, INPUT, INPUT_STYLE, NOTICE, PANEL } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { saveBranding, type BrandingState } from "./actions";

const initialState: BrandingState = { error: null, saved: false };

const labelClass = "text-sm font-medium";

export interface ClubBranding {
  clubId: string;
  clubName: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  reportColorHex: string | null;
  reportStructureRules: string | null;
  arabicFormatNotes: string | null;
  guardrails: string | null;
  managedByName: string | null;
  updatedAt: string | null;
}

// Suggested starting text for a club with no guardrails set — lifted from
// the example in docs/05-business-rules.md rather than invented.
const GUARDRAIL_PLACEHOLDER = `e.g.
- No negative or shaming language toward an athlete
- No comment on an athlete's appearance beyond clinical body composition
- Do not name a competitor brand
- Do not promise performance outcomes or guarantee results`;

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={BTN_PRIMARY}
      style={{ backgroundImage: "var(--brand-gradient)" }}
    >
      {pending ? "Saving…" : "Save branding"}
    </button>
  );
}

export default function BrandingForm({ clubs }: { clubs: ClubBranding[] }) {
  const [state, formAction] = useActionState(saveBranding, initialState);
  const [clubId, setClubId] = useState(clubs[0]?.clubId ?? "");

  const current = clubs.find((c) => c.clubId === clubId);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-1.5 sm:max-w-sm">
        <label htmlFor="club_id" className={labelClass} style={{ color: "var(--text)" }}>
          Club
        </label>
        <select
          id="club_id"
          name="club_id"
          required
          value={clubId}
          onChange={(e) => setClubId(e.target.value)}
          className={INPUT}
          style={INPUT_STYLE}
        >
          {clubs.map((c) => (
            <option key={c.clubId} value={c.clubId}>
              {c.clubName}
            </option>
          ))}
        </select>
        {current?.updatedAt && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Last updated {new Date(current.updatedAt).toLocaleDateString()}
            {current.managedByName ? ` by ${current.managedByName}` : ""}
          </p>
        )}
      </div>

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
      {state.saved && !state.error && (
        <p
          role="status"
          className={NOTICE}
          style={{
            borderColor: "var(--success)",
            color: "var(--success)",
            backgroundColor: "color-mix(in srgb, var(--success) 8%, transparent)",
          }}
        >
          Branding saved.
        </p>
      )}

      {/* ---- Assets ---- */}
      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Assets
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="logo" className={labelClass} style={{ color: "var(--text)" }}>
              Club logo
            </label>
            <input id="logo" name="logo" type="file" accept="image/*" className={INPUT} style={INPUT_STYLE} />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {current?.logoUrl ? `Current: ${current.logoUrl.split("/").pop()}` : "None uploaded yet."} Leave
              empty to keep the existing file.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="advertising_banner" className={labelClass} style={{ color: "var(--text)" }}>
              Advertising banner
            </label>
            <input
              id="advertising_banner"
              name="advertising_banner"
              type="file"
              accept="image/*"
              className={INPUT}
              style={INPUT_STYLE}
            />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {current?.bannerUrl ? `Current: ${current.bannerUrl.split("/").pop()}` : "None uploaded yet."}{" "}
              Leave empty to keep the existing file.
            </p>
          </div>
        </div>
      </section>

      {/* ---- Report template ---- */}
      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Report template
        </h2>
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <label htmlFor="report_color_hex" className={labelClass} style={{ color: "var(--text)" }}>
            Report colour
          </label>
          <div className="flex items-center gap-3">
            <input
              id="report_color_hex"
              name="report_color_hex"
              type="text"
              placeholder="#1B3A5F"
              defaultValue={current?.reportColorHex ?? ""}
              className={INPUT}
              style={{ ...INPUT_STYLE, flex: 1 }}
            />
            {current?.reportColorHex && (
              <span
                className="h-9 w-9 flex-shrink-0 rounded-lg border"
                style={{ backgroundColor: current.reportColorHex, borderColor: "var(--border)" }}
                aria-label={`Current colour ${current.reportColorHex}`}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="report_structure_rules" className={labelClass} style={{ color: "var(--text)" }}>
            Report structure rules
          </label>
          <textarea
            id="report_structure_rules"
            name="report_structure_rules"
            rows={4}
            defaultValue={current?.reportStructureRules ?? ""}
            placeholder="Section order, cover page requirements, footer text, logo placement…"
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="arabic_format_notes" className={labelClass} style={{ color: "var(--text)" }}>
            Arabic format notes
          </label>
          <textarea
            id="arabic_format_notes"
            name="arabic_format_notes"
            rows={3}
            defaultValue={current?.arabicFormatNotes ?? ""}
            placeholder="RTL layout handling, page order for bilingual reports…"
            className={INPUT}
            style={INPUT_STYLE}
          />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Bilingual reports are one PDF with separate pages per language. &ldquo;Bridgetx&rdquo; stays
            LTR inside an RTL document.
          </p>
        </div>
      </section>

      {/* ---- Guardrails ---- */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Additional Instructions guardrails
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            What a practitioner&apos;s custom prompt may and may not influence.
          </p>
        </div>

        <div
          className={`${PANEL} p-4 text-sm`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)", color: "var(--text-muted)" }}
        >
          <p className="font-medium" style={{ color: "var(--text)" }}>
            Enforced structurally, regardless of what you write here:
          </p>
          <ul className="mt-2 list-disc pl-5">
            <li>Cannot remove or reposition club branding</li>
            <li>Cannot restructure a report or add/remove/reorder its sections</li>
            <li>Cannot change the PDF template, colours or logo placement</li>
            <li>Cannot introduce a citation outside the Clinical + Research library</li>
          </ul>
          <p className="mt-2">
            Those hold because branding and layout live in the PDF template code, entirely separate from
            anything the AI writes — not because the model is asked to comply. The field below adds
            club-specific <em>content</em> rules on top.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="additional_instructions_guardrails"
            className={labelClass}
            style={{ color: "var(--text)" }}
          >
            Club-specific content guardrails
          </label>
          <textarea
            id="additional_instructions_guardrails"
            name="additional_instructions_guardrails"
            rows={6}
            defaultValue={current?.guardrails ?? ""}
            placeholder={GUARDRAIL_PLACEHOLDER}
            className={INPUT}
            style={INPUT_STYLE}
          />
        </div>
      </section>

      <div>
        <SaveButton />
      </div>
    </form>
  );
}
