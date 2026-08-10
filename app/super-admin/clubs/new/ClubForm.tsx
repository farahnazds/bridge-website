"use client";

import { useActionState, useState } from "react";
import { BTN_PRIMARY_LG } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { getAllCountries, getTimezonesForCountry } from "countries-and-timezones";
import { SPORTS, OTHER_SPORT } from "@/lib/constants";
import { createClub, type CreateClubState } from "./actions";

const initialState: CreateClubState = { error: null };

// Country picker is friendlier than a raw tz list; the actual `timezone`
// form field still resolves to a real IANA zone underneath (see
// TimezoneField below) — clubs.timezone is unchanged, still free-form IANA
// text, so no data-model or server-action change is needed for this.
const COUNTRIES = Object.values(getAllCountries())
  .map((c) => ({ code: c.id, name: c.name }))
  .sort((a, b) => a.name.localeCompare(b.name));

// Matches the previous default (Asia/Dubai) — UAE is a single-timezone
// country, so this alone resolves the field with no second dropdown shown.
const DEFAULT_COUNTRY = "AE";

function formatZoneLabel(zone: { name: string; utcOffsetStr: string }): string {
  const place = zone.name.split("/").pop()?.replace(/_/g, " ") ?? zone.name;
  return `${place} (UTC${zone.utcOffsetStr})`;
}

// Renders a Country select, plus a second Region select that only appears
// for countries spanning more than one IANA zone (US, Russia, Australia,
// etc.). Submits the resolved IANA zone under the same "timezone" field
// name the server action already expects.
function TimezoneField() {
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [region, setRegion] = useState("");

  const zones = getTimezonesForCountry(country) ?? [];
  const sortedZones = [...zones].sort((a, b) => a.utcOffset - b.utcOffset);
  const resolvedRegion = sortedZones.some((z) => z.name === region)
    ? region
    : (sortedZones[0]?.name ?? "");
  const resolvedTimezone = sortedZones.length <= 1 ? (sortedZones[0]?.name ?? "") : resolvedRegion;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="country" className={labelClass} style={{ color: "var(--text)" }}>
          Country
        </label>
        <select
          id="country"
          required
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            setRegion("");
          }}
          className={inputClass}
          style={inputStyle}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {sortedZones.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="region" className={labelClass} style={{ color: "var(--text)" }}>
            Region
          </label>
          <select
            id="region"
            required
            value={resolvedRegion}
            onChange={(e) => setRegion(e.target.value)}
            className={inputClass}
            style={inputStyle}
          >
            {sortedZones.map((z) => (
              <option key={z.name} value={z.name}>
                {formatZoneLabel(z)}
              </option>
            ))}
          </select>
        </div>
      )}

      <input type="hidden" name="timezone" value={resolvedTimezone} />
    </div>
  );
}

const inputClass =
  "rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-transparent focus:ring-2 focus:ring-[color:var(--brand-blue)]";
const inputStyle = {
  borderColor: "var(--border)",
  backgroundColor: "var(--surface)",
  color: "var(--text)",
};
const labelClass = "text-sm font-medium";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={BTN_PRIMARY_LG}
      style={{ backgroundImage: "var(--brand-gradient)" }}
    >
      {pending ? "Creating…" : "Create club & send invite"}
    </button>
  );
}

export default function ClubForm() {
  const [state, formAction] = useActionState(createClub, initialState);
  const [sportMode, setSportMode] = useState<"select" | "other">("select");

  return (
    <form action={formAction} className="flex flex-col gap-8" noValidate>
      {state.error && (
        <p
          role="alert"
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            borderColor: "var(--danger)",
            color: "var(--danger)",
            backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
          }}
        >
          {state.error}
        </p>
      )}

      <section className="flex flex-col gap-5">
        <h2
          className="text-base font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Club details
        </h2>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className={labelClass} style={{ color: "var(--text)" }}>
            Club name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="e.g. Al Wasl Academy"
            className={inputClass}
            style={inputStyle}
          />
        </div>

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
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value === OTHER_SPORT) setSportMode("other");
                }}
                className={inputClass}
                style={inputStyle}
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
                  autoFocus
                  placeholder="Enter sport name"
                  className={inputClass}
                  style={inputStyle}
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

          <TimezoneField />
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <div>
          <h2
            className="text-base font-semibold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
          >
            Club Manager
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            They&apos;ll get an email invite to activate their account and set a password.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="manager_first_name"
              className={labelClass}
              style={{ color: "var(--text)" }}
            >
              First name
            </label>
            <input
              id="manager_first_name"
              name="manager_first_name"
              type="text"
              required
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="manager_last_name"
              className={labelClass}
              style={{ color: "var(--text)" }}
            >
              Last name
            </label>
            <input
              id="manager_last_name"
              name="manager_last_name"
              type="text"
              required
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="manager_email"
            className={labelClass}
            style={{ color: "var(--text)" }}
          >
            Email
          </label>
          <input
            id="manager_email"
            name="manager_email"
            type="email"
            required
            placeholder="manager@club.com"
            className={inputClass}
            style={inputStyle}
          />
        </div>
      </section>

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
