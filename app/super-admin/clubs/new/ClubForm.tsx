"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createClub, type CreateClubState } from "./actions";

const initialState: CreateClubState = { error: null };

const TIMEZONES = [
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Qatar",
  "Asia/Kuwait",
  "Asia/Bahrain",
  "Asia/Muscat",
];

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
            <input
              id="sport"
              name="sport"
              type="text"
              required
              list="sport-suggestions"
              placeholder="e.g. Basketball"
              className={inputClass}
              style={inputStyle}
            />
            <datalist id="sport-suggestions">
              <option value="Basketball" />
              <option value="Football" />
            </datalist>
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
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
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
