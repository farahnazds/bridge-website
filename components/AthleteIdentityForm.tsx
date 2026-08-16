"use client";

import { useActionState, useState } from "react";
import { BTN_PRIMARY, CARD, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { updateAthleteIdentity, type IdentityState } from "@/app/club/[clubId]/athletes/[athleteId]/actions";
import { SPORTS, OTHER_SPORT, TIERS, DIET_PREFERENCES, GENDERS, MENSTRUAL_STATUSES, IRON_STATUSES } from "@/lib/constants";
import EthnicityField from "@/components/EthnicityField";
import PositionField from "@/components/PositionField";
import type { AthleteIdentity } from "@/lib/athleteProfile";

const initial: IdentityState = { error: null, saved: false };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className={`w-fit ${BTN_PRIMARY}`}
      style={{ backgroundImage: "var(--brand-gradient-action)" }}>
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium" style={{ color: "var(--text)" }}>{label}</label>
      {children}
    </div>
  );
}

function Read({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-sm" style={{ color: "var(--text)" }}>{value}</p>
    </div>
  );
}

export default function AthleteIdentityForm({
  athlete, clubId, canEdit,
}: {
  athlete: AthleteIdentity; clubId: string | null; canEdit: boolean;
}) {
  const [state, action] = useActionState(updateAthleteIdentity, initial);
  const [editing, setEditing] = useState(false);
  const knownSport = SPORTS.includes(athlete.sport ?? "");
  const [sport, setSport] = useState(athlete.sport && !knownSport ? OTHER_SPORT : athlete.sport ?? "");
  // Controlled (it used to lose the saved value entirely when unknown): the
  // free-text sport, which also feeds the sport-aware Position field below.
  const [sportText, setSportText] = useState(athlete.sport && !knownSport ? athlete.sport : "");
  const effectiveSport = sport === OTHER_SPORT ? sportText : sport;
  // Gates the Female athlete cycle block on the LIVE form value, so setting
  // gender to female reveals it in the same edit session.
  const [gender, setGender] = useState(athlete.gender ?? "");

  if (state.saved && editing) setEditing(false);

  const tierLabel = TIERS.find((t) => t.value === athlete.tier)?.label ?? athlete.tier ?? "—";
  const dietLabel = DIET_PREFERENCES.find((d) => d.value === athlete.diet_preference)?.label ?? athlete.diet_preference ?? "—";
  const genderLabel = GENDERS.find((g) => g.value === athlete.gender)?.label ?? athlete.gender ?? "—";
  const menstrualLabel = MENSTRUAL_STATUSES.find((m) => m.value === athlete.menstrual_status)?.label ?? athlete.menstrual_status ?? "Not recorded";
  const ironLabel = IRON_STATUSES.find((i) => i.value === athlete.iron_status)?.label ?? athlete.iron_status ?? "Not recorded";

  if (!editing) {
    return (
      <div className={`flex flex-col gap-4 ${CARD} p-5`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Identity &amp; personal details
          </h2>
          {canEdit && (
            <button type="button" onClick={() => setEditing(true)}
              className="text-xs font-medium underline-offset-2 hover:underline" style={{ color: "var(--brand-blue)" }}>
              Edit
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Read label="Name" value={`${athlete.first_name} ${athlete.last_name}`} />
          <Read label="Athlete code" value={athlete.code} />
          <Read label="Sport" value={athlete.sport ?? "—"} />
          <Read label="Position" value={athlete.position ?? "—"} />
          <Read label="Tier" value={tierLabel} />
          <Read label="Diet" value={dietLabel} />
          <Read label="Date of birth" value={athlete.dob ?? "—"} />
          <Read label="Gender" value={genderLabel} />
          <Read label="Country" value={athlete.country ?? "—"} />
          <Read label="Ethnicity" value={athlete.ethnicity ?? "—"} />
          <Read label="Status" value={athlete.status === "read_only" ? "Read-only" : "Active"} />
          {/* The whole cycle block — the 028 statuses AND the 047 cycle
              facts — shows only for female athletes (ruling 2026-08-17). */}
          {athlete.gender === "female" && (
            <>
              <Read label="Menstrual status" value={menstrualLabel} />
              <Read label="Iron status" value={ironLabel} />
              <Read label="Avg cycle length" value={athlete.avg_cycle_length_days !== null ? `${athlete.avg_cycle_length_days} days` : "Not recorded"} />
              <Read label="Period duration" value={athlete.period_duration_days !== null ? `${athlete.period_duration_days} days` : "Not recorded"} />
              <Read label="Last period started" value={athlete.last_period_start_date ?? "Not recorded"} />
            </>
          )}
          <Read label="Goal body fat" value={athlete.goal_body_fat_pct !== null ? athlete.goal_body_fat_pct + "%" : "No goal set"} />
          <Read label="Goal lean mass" value={athlete.goal_lean_mass_kg !== null ? athlete.goal_lean_mass_kg + " kg" : "No goal set"} />
        </div>
        {state.saved && (
          <p className="text-sm" style={{ color: "var(--success)" }}>Saved.</p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className={`flex flex-col gap-4 ${CARD} p-5`}
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
      <input type="hidden" name="athlete_id" value={athlete.id} />
      <input type="hidden" name="club_id" value={clubId ?? ""} />
      <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
        Editing identity &amp; personal details
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="First name">
          <input name="first_name" required defaultValue={athlete.first_name} className={INPUT} style={INPUT_STYLE} />
        </Field>
        <Field label="Last name">
          <input name="last_name" required defaultValue={athlete.last_name} className={INPUT} style={INPUT_STYLE} />
        </Field>
        <Field label="Sport">
          {/* No empty option: athletes.sport is NOT NULL, so an empty choice
              would fail at the database rather than in validation. */}
          <select value={sport} onChange={(e) => setSport(e.target.value)} required
            name={sport === OTHER_SPORT ? undefined : "sport"} className={INPUT} style={INPUT_STYLE}>
            <option value="" disabled>Select a sport…</option>
            {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value={OTHER_SPORT}>Other…</option>
          </select>
          {sport === OTHER_SPORT && (
            <input name="sport" required placeholder="Sport" value={sportText}
              onChange={(e) => setSportText(e.target.value)} className={`${INPUT} mt-2`} style={INPUT_STYLE} />
          )}
        </Field>
        {/* Sport-aware, shared with the registration form — options, label
            and visibility follow the sport chosen above. */}
        <PositionField
          key={effectiveSport || "none"}
          sport={effectiveSport || null}
          initialPosition={athlete.position}
        />
        <Field label="Tier">
          <select name="tier" defaultValue={athlete.tier ?? ""} className={INPUT} style={INPUT_STYLE}>
            <option value="">—</option>
            {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Diet preference">
          <select name="diet_preference" defaultValue={athlete.diet_preference ?? ""} className={INPUT} style={INPUT_STYLE}>
            <option value="">—</option>
            {DIET_PREFERENCES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </Field>
        <Field label="Date of birth">
          <input name="dob" type="date" defaultValue={athlete.dob ?? ""} className={INPUT} style={INPUT_STYLE} />
        </Field>
        <Field label="Gender">
          <select name="gender" value={gender} onChange={(e) => setGender(e.target.value)}
            className={INPUT} style={INPUT_STYLE}>
            <option value="">—</option>
            {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </Field>
        <Field label="Country">
          <input name="country" defaultValue={athlete.country ?? ""} className={INPUT} style={INPUT_STYLE} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={athlete.status} className={INPUT} style={INPUT_STYLE}>
            <option value="active">Active</option>
            <option value="read_only">Read-only</option>
          </select>
        </Field>
        <Field label="Goal body fat %">
          <input name="goal_body_fat_pct" type="number" min={3} max={60} step={0.1}
            placeholder="No goal set" defaultValue={athlete.goal_body_fat_pct ?? ""}
            className={INPUT} style={INPUT_STYLE} />
        </Field>
        <Field label="Goal lean mass (kg)">
          <input name="goal_lean_mass_kg" type="number" min={20} max={150} step={0.1}
            placeholder="No goal set" defaultValue={athlete.goal_lean_mass_kg ?? ""}
            className={INPUT} style={INPUT_STYLE} />
        </Field>
        <EthnicityField initialValue={athlete.ethnicity} />
      </div>

      {/* Female athlete cycle — the 028 statuses and the 047 cycle facts as
          ONE block, rendered only while gender = female (ruling 2026-08-17).
          Hidden inputs don't submit; the action treats absent as "clear", so
          flipping gender away clears these on save rather than stranding
          stale values. Blank = not recorded, and the nutrition prompt reports
          that rather than assuming normal. */}
      {gender === "female" && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Female athlete cycle
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Menstrual status">
              <select name="menstrual_status" defaultValue={athlete.menstrual_status ?? ""} className={INPUT} style={INPUT_STYLE}>
                <option value="">Not recorded</option>
                {MENSTRUAL_STATUSES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Iron status">
              <select name="iron_status" defaultValue={athlete.iron_status ?? ""} className={INPUT} style={INPUT_STYLE}>
                <option value="">Not recorded</option>
                {IRON_STATUSES.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </Field>
            <Field label="Average cycle length (days)">
              <input name="avg_cycle_length_days" type="number" min={10} max={120} step={1}
                placeholder="Not recorded" defaultValue={athlete.avg_cycle_length_days ?? ""}
                className={INPUT} style={INPUT_STYLE} />
            </Field>
            <Field label="Period duration (days)">
              <input name="period_duration_days" type="number" min={1} max={30} step={1}
                placeholder="Not recorded" defaultValue={athlete.period_duration_days ?? ""}
                className={INPUT} style={INPUT_STYLE} />
            </Field>
            <Field label="Start date of last period">
              <input name="last_period_start_date" type="date"
                defaultValue={athlete.last_period_start_date ?? ""}
                className={INPUT} style={INPUT_STYLE} />
            </Field>
          </div>
        </div>
      )}

      {state.error && (
        <p role="alert" className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{state.error}</p>
      )}

      {/* Stated on the form, not just in a doc: identity edits are not recorded
          anywhere yet. audit_log exists but nothing writes to it. */}
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Changes overwrite the current values. They aren&apos;t recorded in an edit history yet.
      </p>

      <div className="flex items-center gap-3">
        <Submit />
        <button type="button" onClick={() => setEditing(false)}
          className="text-sm underline-offset-2 hover:underline" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
