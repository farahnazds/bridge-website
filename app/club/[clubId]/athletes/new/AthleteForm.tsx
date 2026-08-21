"use client";

import { useActionState, useState } from "react";
import { BTN_PRIMARY_LG, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { getAllCountries } from "countries-and-timezones";
import { SPORTS, OTHER_SPORT, TIERS, DIET_PREFERENCES, GENDERS, MENSTRUAL_STATUSES, IRON_STATUSES } from "@/lib/constants";
import { generateAthleteCode } from "@/lib/athleteCode";
import EthnicityField from "@/components/EthnicityField";
import PositionField from "@/components/PositionField";
import { registerAthlete, type RegisterAthleteState } from "./actions";

const initialState: RegisterAthleteState = { error: null };

const COUNTRIES = Object.values(getAllCountries())
  .map((c) => ({ code: c.id, name: c.name }))
  .sort((a, b) => a.name.localeCompare(b.name));

const labelClass = "text-sm font-medium";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={BTN_PRIMARY_LG}
      style={{ backgroundImage: "var(--brand-gradient-action)" }}
    >
      {pending ? "Registering…" : "Register athlete & send invite"}
    </button>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-base font-semibold"
      style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
    >
      {children}
    </h2>
  );
}

function ChecklistField({
  legend,
  fieldName,
  otherFieldName,
  options,
}: {
  legend: string;
  fieldName: string;
  otherFieldName: string;
  options: { code: string; label: string }[];
}) {
  const [otherChecked, setOtherChecked] = useState(false);
  const nonOther = options.filter((o) => o.code !== "other");
  const hasOther = options.some((o) => o.code === "other");

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={labelClass} style={{ color: "var(--text)" }}>
        {legend}
      </legend>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {nonOther.map((opt) => (
          <label
            key={opt.code}
            className="flex items-center gap-2 text-sm"
            style={{ color: "var(--text)" }}
          >
            <input type="checkbox" name={fieldName} value={opt.code} />
            {opt.label}
          </label>
        ))}
        {hasOther && (
          <label
            className="flex items-center gap-2 text-sm"
            style={{ color: "var(--text)" }}
          >
            <input
              type="checkbox"
              name={fieldName}
              value="other"
              checked={otherChecked}
              onChange={(e) => setOtherChecked(e.target.checked)}
            />
            Other
          </label>
        )}
      </div>
      {otherChecked && (
        <input
          type="text"
          name={otherFieldName}
          required
          placeholder="Specify…"
          className={INPUT}
          style={INPUT_STYLE}
        />
      )}
    </fieldset>
  );
}

export default function AthleteForm({
  clubId,
  clubSport,
  teams,
  conditions,
  allergies,
  intolerances,
}: {
  clubId: string;
  /** The club's own sport, pre-filling the Sport field (editable). Null when
   *  the club row couldn't be read. */
  clubSport: string | null;
  teams: { id: string; name: string; category: string | null }[];
  conditions: { code: string; label: string }[];
  allergies: { code: string; label: string }[];
  intolerances: { code: string; label: string }[];
}) {
  const [state, formAction] = useActionState(registerAthlete, initialState);

  // clubs.sport is an open list (free text at club creation), so it may or
  // may not be one of the SPORTS options: a listed sport pre-selects it, an
  // unlisted one starts the field in free-text mode pre-filled with it.
  const clubSportListed = clubSport !== null && (SPORTS as readonly string[]).includes(clubSport);

  const [lastName, setLastName] = useState("");
  const [code, setCode] = useState(() => generateAthleteCode(""));
  const [codeTouched, setCodeTouched] = useState(false);
  const [sportMode, setSportMode] = useState<"select" | "other">(
    clubSport && !clubSportListed ? "other" : "select"
  );
  // The sport is tracked as VALUE, not just mode, because the Position field
  // below is sport-aware — its options, label, or very existence follow the
  // sport currently chosen (see components/PositionField.tsx).
  const [sportChoice, setSportChoice] = useState(clubSportListed ? (clubSport as string) : "");
  const [sportText, setSportText] = useState(clubSport && !clubSportListed ? clubSport : "");
  const effectiveSport = sportMode === "select" ? sportChoice : sportText;
  // Gender gates the Female athlete cycle section — fully hidden otherwise.
  const [gender, setGender] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  function handleLastNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setLastName(value);
    if (!codeTouched) setCode(generateAthleteCode(value));
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  return (
    <form action={formAction} className="flex flex-col gap-8" noValidate>
      <input type="hidden" name="club_id" value={clubId} />

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

      {/* ---- Photo ---- */}
      <section className="flex flex-col gap-5">
        <SectionHeading>Photo</SectionHeading>
        <div className="flex items-center gap-4">
          <div
            className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
          >
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                No photo
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <input
              id="photo"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoChange}
              className="w-full min-w-0 text-sm"
              style={{ color: "var(--text)" }}
            />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Club athletes have no self-editable fields — you&apos;re uploading this on their
              behalf.
            </p>
          </div>
        </div>
      </section>

      {/* ---- Personal information ---- */}
      <section className="flex flex-col gap-5">
        <SectionHeading>Personal information</SectionHeading>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="first_name" className={labelClass} style={{ color: "var(--text)" }}>
              First name
            </label>
            <input
              id="first_name"
              name="first_name"
              type="text"
              required
              className={INPUT}
              style={INPUT_STYLE}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="last_name" className={labelClass} style={{ color: "var(--text)" }}>
              Last name
            </label>
            <input
              id="last_name"
              name="last_name"
              type="text"
              required
              value={lastName}
              onChange={handleLastNameChange}
              className={INPUT}
              style={INPUT_STYLE}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className={labelClass} style={{ color: "var(--text)" }}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="athlete@example.com"
              className={INPUT}
              style={INPUT_STYLE}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dob" className={labelClass} style={{ color: "var(--text)" }}>
              Date of birth
            </label>
            <input
              id="dob"
              name="dob"
              type="date"
              className={INPUT}
              style={INPUT_STYLE}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="gender" className={labelClass} style={{ color: "var(--text)" }}>
              Gender
            </label>
            <select
              id="gender"
              name="gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className={INPUT}
              style={INPUT_STYLE}
            >
              <option value="">Not specified</option>
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="country" className={labelClass} style={{ color: "var(--text)" }}>
              Country
            </label>
            <select id="country" name="country" defaultValue="" className={INPUT} style={INPUT_STYLE}>
              <option value="">Not specified</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <EthnicityField />
      </section>

      {/* ---- Body composition ---- */}
      <section className="flex flex-col gap-5">
        <SectionHeading>Body composition</SectionHeading>
        {/* Body fat was removed 2026-08-17: composition is measured through
            the Assessments page's four real methods (Tanita / InBody /
            Skinfold / DEXA), and nothing ever read the registration-time
            value. Weight and height stay as basic intake facts. */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="weight_kg" className={labelClass} style={{ color: "var(--text)" }}>
              Weight (kg)
            </label>
            <input
              id="weight_kg"
              name="weight_kg"
              type="number"
              step="0.1"
              min="0"
              className={INPUT}
              style={INPUT_STYLE}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="height_cm" className={labelClass} style={{ color: "var(--text)" }}>
              Height (cm)
            </label>
            <input
              id="height_cm"
              name="height_cm"
              type="number"
              step="0.1"
              min="0"
              className={INPUT}
              style={INPUT_STYLE}
            />
          </div>
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Body fat and lean mass are recorded through Assessments (Tanita, InBody, Skinfold, DEXA),
          not at registration.
        </p>
      </section>

      {/* ---- Diet / clinical profile ---- */}
      <section className="flex flex-col gap-5">
        <SectionHeading>Diet / clinical profile</SectionHeading>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="diet_preference" className={labelClass} style={{ color: "var(--text)" }}>
            Diet / religion preference
          </label>
          <select
            id="diet_preference"
            name="diet_preference"
            defaultValue="none"
            className={INPUT}
            style={INPUT_STYLE}
          >
            {DIET_PREFERENCES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <ChecklistField
          legend="Medical / operational conditions"
          fieldName="conditions"
          otherFieldName="conditions_other"
          options={conditions}
        />
        <ChecklistField
          legend="Allergies"
          fieldName="allergies"
          otherFieldName="allergies_other"
          options={allergies}
        />
        <ChecklistField
          legend="Intolerances / sensitivities"
          fieldName="intolerances"
          otherFieldName="intolerances_other"
          options={intolerances}
        />
      </section>

      {/* ---- Female athlete cycle ---- */}
      {/* Rendered ONLY when gender = female (owner ruling 2026-08-17) —
          including the migration-028 status fields that used to always show.
          Hidden inputs don't submit, so flipping gender away simply saves
          nothing here. */}
      {gender === "female" && (
      <section className="flex flex-col gap-5">
        <SectionHeading>Female athlete cycle</SectionHeading>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="menstrual_status"
              className={labelClass}
              style={{ color: "var(--text)" }}
            >
              Menstrual status
            </label>
            {/* Constrained since migration 028: free text here could not drive
                RED-S screening reliably, and now violates a CHECK. */}
            <select
              id="menstrual_status"
              name="menstrual_status"
              defaultValue=""
              className={INPUT}
              style={INPUT_STYLE}
            >
              <option value="">Not recorded</option>
              {MENSTRUAL_STATUSES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="iron_status" className={labelClass} style={{ color: "var(--text)" }}>
              Iron status
            </label>
            <select
              id="iron_status"
              name="iron_status"
              defaultValue=""
              className={INPUT}
              style={INPUT_STYLE}
            >
              <option value="">Not recorded</option>
              {IRON_STATUSES.map((i) => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Migration 047 — input-only cycle facts; no calculation logic reads
            these yet (docs/07's cycle-phase engine is the eventual consumer). */}
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="avg_cycle_length_days" className={labelClass} style={{ color: "var(--text)" }}>
              Average cycle length (days)
            </label>
            <input
              id="avg_cycle_length_days"
              name="avg_cycle_length_days"
              type="number"
              min="10"
              max="120"
              step="1"
              className={INPUT}
              style={INPUT_STYLE}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="period_duration_days" className={labelClass} style={{ color: "var(--text)" }}>
              Period duration (days)
            </label>
            <input
              id="period_duration_days"
              name="period_duration_days"
              type="number"
              min="1"
              max="30"
              step="1"
              className={INPUT}
              style={INPUT_STYLE}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="last_period_start_date" className={labelClass} style={{ color: "var(--text)" }}>
              Start date of last period
            </label>
            <input
              id="last_period_start_date"
              name="last_period_start_date"
              type="date"
              className={INPUT}
              style={INPUT_STYLE}
            />
          </div>
        </div>
      </section>
      )}

      {/* ---- Sport & classification ---- */}
      <section className="flex flex-col gap-5">
        <SectionHeading>Sport & classification</SectionHeading>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sport" className={labelClass} style={{ color: "var(--text)" }}>
              Sport
            </label>
            {sportMode === "select" ? (
              <select
                id="sport"
                name="sport"
                required
                value={sportChoice}
                onChange={(e) => {
                  if (e.target.value === OTHER_SPORT) setSportMode("other");
                  else setSportChoice(e.target.value);
                }}
                className={INPUT}
                style={INPUT_STYLE}
              >
                <option value="" disabled>
                  Select a sport…
                </option>
                {SPORTS.map((sport) => (
                  <option key={sport} value={sport}>
                    {sport}
                  </option>
                ))}
                <option value={OTHER_SPORT}>Other…</option>
              </select>
            ) : (
              <div className="flex flex-col gap-1.5">
                <input
                  id="sport"
                  name="sport"
                  type="text"
                  required
                  value={sportText}
                  onChange={(e) => setSportText(e.target.value)}
                  placeholder="Enter sport name"
                  className={INPUT}
                  style={INPUT_STYLE}
                />
                <button
                  type="button"
                  onClick={() => setSportMode("select")}
                  className="self-start text-xs font-medium underline-offset-2 hover:underline"
                  style={{ color: "var(--brand-blue)" }}
                >
                  Choose from list instead
                </button>
              </div>
            )}
          </div>

          {/* Sport-aware: options/label/visibility follow the chosen sport;
              the key remounts it so state can't leak across sports. */}
          <PositionField key={effectiveSport || "none"} sport={effectiveSport || null} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tier" className={labelClass} style={{ color: "var(--text)" }}>
              Tier
            </label>
            <select id="tier" name="tier" defaultValue="" className={INPUT} style={INPUT_STYLE}>
              <option value="">Not specified</option>
              {TIERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="team_id" className={labelClass} style={{ color: "var(--text)" }}>
              Team
            </label>
            {teams.length > 0 ? (
              <select
                id="team_id"
                name="team_id"
                required
                defaultValue=""
                className={INPUT}
                style={INPUT_STYLE}
              >
                <option value="" disabled>
                  Select a team…
                </option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            ) : (
              <p
                className="rounded-lg border px-3.5 py-2.5 text-sm"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                No teams yet — create one first.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className={labelClass} style={{ color: "var(--text)" }}>
            Athlete code
          </label>
          <input
            id="code"
            name="code"
            type="text"
            required
            value={code}
            onChange={(e) => {
              setCodeTouched(true);
              setCode(e.target.value);
            }}
            className={INPUT}
            style={{ ...INPUT_STYLE, fontFamily: "var(--font-mono)" }}
          />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Auto-generated — edit if you&apos;d rather use your own numbering.
          </p>
        </div>
      </section>

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
