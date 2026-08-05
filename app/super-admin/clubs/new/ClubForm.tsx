"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createClub, type CreateClubState } from "./actions";

const initialState: CreateClubState = { error: null };

// Broad global fallback for environments without Intl.supportedValuesOf
// (older browsers) — major cities across every continent, not just GCC.
// Bridgetx targets UAE first but is built to work for clubs anywhere.
const FALLBACK_TIMEZONES = [
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Bogota",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Toronto",
  "Asia/Bahrain",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Kolkata",
  "Asia/Kuwait",
  "Asia/Muscat",
  "Asia/Qatar",
  "Asia/Riyadh",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Paris",
  "Europe/Rome",
  "Pacific/Auckland",
  "Pacific/Honolulu",
  "UTC",
];

// Full canonical IANA tz database where the runtime supports it (all
// current browsers + Node 18+); falls back to the curated list above
// otherwise. See docs/09-roadmap.md — global rollout is a stated goal,
// so this shouldn't be hardcoded to GCC-only.
function getTimezones(): string[] {
  if (typeof Intl.supportedValuesOf === "function") {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      // fall through to the curated list
    }
  }
  return FALLBACK_TIMEZONES;
}

function groupTimezonesByRegion(zones: string[]): [string, string[]][] {
  const groups = new Map<string, string[]>();
  for (const zone of zones) {
    const region = zone.includes("/") ? zone.split("/")[0] : "Other";
    const list = groups.get(region);
    if (list) list.push(zone);
    else groups.set(region, [zone]);
  }
  for (const list of groups.values()) list.sort();
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const TIMEZONE_GROUPS = groupTimezonesByRegion(getTimezones());

// Curated starting list, not a DB enum — `clubs.sport` is a free-text
// column by design so new sports can onboard without a migration (see
// docs/05-business-rules.md, "Multi-sport foundation"). "Other" below
// keeps that open, extensible; the dropdown just replaces raw free typing
// as the default entry path.
const SPORTS = ["Basketball", "Football", "Rugby", "Motorsport / F1"];
const OTHER_SPORT = "__other__";

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
      className="rounded-lg px-5 py-3 text-sm font-semibold text-white transition-[opacity,transform] duration-200 ease-out hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
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

          <div className="flex flex-col gap-1.5">
            <label htmlFor="timezone" className={labelClass} style={{ color: "var(--text)" }}>
              Timezone
            </label>
            <select
              id="timezone"
              name="timezone"
              required
              defaultValue="Asia/Dubai"
              className={inputClass}
              style={inputStyle}
            >
              {TIMEZONE_GROUPS.map(([region, zones]) => (
                <optgroup key={region} label={region}>
                  {zones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
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
