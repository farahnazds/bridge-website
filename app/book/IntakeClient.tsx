"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";
import { submitIntake, type IntakeState } from "./actions";

// Step 1 of the public Book-a-Meeting flow — the intake card from the
// "Bridgetx Intake" design, in real tokens. Eight fields across two sections;
// submitting saves the lead (leads table, public-insert RLS), notifies the
// owner by email, and advances to /book/schedule with the lead carried in
// the URL.

const MONO = "var(--font-mono), monospace";

const ROLES = [
  "Club Manager / Director",
  "Head Coach",
  "Performance Coach",
  "Sports Nutritionist",
  "Physiotherapist / Doctor",
  "Independent Practitioner",
  "Federation / Association Representative",
  "Other",
];

const SPORTS = [
  "Football", "Basketball", "Rugby Union", "Rugby League", "Swimming", "Athletics", "Cycling",
  "Rowing", "Hockey", "Netball", "Cricket", "Tennis", "Handball", "Volleyball", "Combat Sports",
  "Gaelic Games", "American Football", "Motorsport", "Triathlon", "Other",
];

const SQUADS = ["1–20", "21–50", "51–150", "150+"];

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia",
  "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium",
  "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria",
  "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad",
  "Chile", "China", "Colombia", "Comoros", "Congo (Brazzaville)", "Congo (Kinshasa)", "Costa Rica",
  "Côte d'Ivoire", "Croatia", "Cuba", "Cyprus", "Czechia", "Denmark", "Djibouti", "Dominica",
  "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia",
  "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana",
  "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hong Kong",
  "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica",
  "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia",
  "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Macau", "Madagascar",
  "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico",
  "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia",
  "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea",
  "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea",
  "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda",
  "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino",
  "São Tomé and Príncipe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore",
  "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain",
  "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania",
  "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan",
  "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay",
  "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe", "Other",
];

const initialState: IntakeState = { error: null };

function SectionHead({ gradient, label }: { gradient: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-0.5 w-[22px] rounded-[1px]" style={{ background: gradient }} />
      <span className="text-[11px] uppercase" style={{ fontFamily: MONO, letterSpacing: ".16em", color: "var(--text-muted)" }}>
        {label}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

function SelectField({ name, prompt, options }: { name: string; prompt: string; options: readonly string[] }) {
  return (
    <select name={name} defaultValue="" required className={INPUT} style={INPUT_STYLE}>
      <option value="" disabled>{prompt}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function ContinueButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="relative flex-none rounded-[10px] px-8 py-3 text-[14.5px] font-semibold text-white transition-[filter] duration-200 ease-out hover:brightness-110 disabled:opacity-60"
      style={{ backgroundImage: "var(--brand-gradient-action)" }}
    >
      {pending ? "Saving…" : "Continue"}
    </button>
  );
}

export default function IntakeClient() {
  const [state, action] = useActionState(submitIntake, initialState);
  const glowRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div className="flex max-w-[600px] flex-col items-center gap-3.5 text-center">
        <h1
          className="m-0 text-[clamp(34px,5vw,46px)] font-semibold"
          style={{ fontFamily: "var(--font-heading)", lineHeight: 1.06, letterSpacing: "-.034em", color: "var(--text)", textWrap: "pretty" }}
        >
          First, a little context.
        </h1>
        <p className="m-0 text-[17px]" style={{ lineHeight: 1.65, color: "var(--text-muted)", textWrap: "pretty" }}>
          Eight quick fields so we arrive knowing your sport and squad. Takes under a minute.
        </p>
      </div>

      <form
        action={action}
        className="w-full max-w-[760px] overflow-hidden rounded-[18px] border"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        {/* Honeypot — invisible to people, irresistible to bots. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

        <div className="flex flex-col gap-5 px-8 py-7">
          <SectionHead gradient="linear-gradient(90deg, var(--brand-teal), var(--brand-sky))" label="Contact" />
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <Field label="Name">
              <input name="name" type="text" required placeholder="Jordan Reeve" className={INPUT} style={INPUT_STYLE} />
            </Field>
            <Field label="Email">
              <input name="email" type="email" required placeholder="you@yourclub.com" className={INPUT} style={INPUT_STYLE} />
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-5 border-t px-8 py-7" style={{ borderColor: "var(--border)" }}>
          <SectionHead gradient="linear-gradient(90deg, var(--brand-sky), var(--brand-blue-deep))" label="Your setup" />
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <Field label="Club / Company">
              <input name="club_name" type="text" required placeholder="Northside Academy" className={INPUT} style={INPUT_STYLE} />
            </Field>
            <Field label="Role">
              <SelectField name="role" prompt="Select role" options={ROLES} />
            </Field>
            <Field label="Country">
              <SelectField name="country" prompt="Select country" options={COUNTRIES} />
            </Field>
            <Field label="Sport">
              <SelectField name="sport" prompt="Select sport" options={SPORTS} />
            </Field>
            <Field label="Approximate squad size">
              <SelectField name="squad_size" prompt="Select range" options={SQUADS} />
            </Field>
            <Field label="Phone (optional)">
              <input name="phone" type="tel" placeholder="+971 50 000 0000" className={INPUT} style={INPUT_STYLE} />
            </Field>
          </div>
          {state.error && (
            <p role="alert" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)", backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)" }}>
              {state.error}
            </p>
          )}
        </div>

        {/* The CTA bar with the design's cursor-proximity glow — a soft
            radial that fades in as the pointer nears the button. DOM-written
            CSS vars, no per-move re-render; quiet per docs/06 motion. */}
        <div
          className="relative flex flex-wrap items-center justify-between gap-4 overflow-hidden border-t px-8 py-6"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-raised)" }}
          onPointerMove={(e) => {
            const glow = glowRef.current;
            if (!glow) return;
            const bar = e.currentTarget.getBoundingClientRect();
            const dist = Math.hypot(e.clientX - (bar.right - 90), e.clientY - (bar.top + bar.height / 2));
            glow.style.opacity = dist > 260 ? "0" : Math.pow(1 - dist / 260, 1.4).toFixed(3);
            glow.style.setProperty("--gx", `${e.clientX - bar.left}px`);
            glow.style.setProperty("--gy", `${e.clientY - bar.top}px`);
          }}
          onPointerLeave={() => { if (glowRef.current) glowRef.current.style.opacity = "0"; }}
        >
          <div
            ref={glowRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ease-out"
            style={{
              background:
                "radial-gradient(340px 150px at var(--gx, 80%) var(--gy, 50%), color-mix(in srgb, var(--brand-teal) 30%, transparent) 0%, color-mix(in srgb, var(--brand-sky) 20%, transparent) 34%, color-mix(in srgb, var(--brand-blue-deep) 12%, transparent) 62%, transparent 100%)",
            }}
          />
          <span className="relative text-[13px]" style={{ color: "var(--text-muted)" }}>
            Next: pick a time that suits you.
          </span>
          <ContinueButton />
        </div>
      </form>
    </>
  );
}
