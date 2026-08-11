import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountIdentity } from "./identity";
import NameForm from "./NameForm";
import PasswordForm from "./PasswordForm";
import { ROLE_LABELS, SPECIALTIES } from "@/lib/constants";
import { CARD, NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "My Account — Bridgetx" };

// The one account page, reached from the header dropdown on every dashboard —
// Super Admin, Admin, Club Manager, Club Practitioner, Club Athlete.
//
// One route rather than one per dashboard, for the same reason AthleteProfile
// is one component behind two routes: the fields are identical for everyone,
// only a couple of sections are role-specific. It lives at the top level
// (/account) rather than inside a role tree because every role tree is scoped
// to a club, team or athlete id that the account itself has nothing to do with.
//
// WHAT THIS PAGE IS NOT: it is not /staff/profile. That route is the
// practitioner's "auto-generated work history timeline" (docs/03-site-map.md),
// still a ComingSoon placeholder — a different page about their career across
// clubs and teams, not their login. Nothing was folded together; the account
// menu points here for every role, and the practitioner sidebar still points
// at /staff/profile for the other thing.

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-4 ${CARD} p-5`}
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <div>
        <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          {title}
        </h2>
        {hint && (
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {hint}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Read({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="text-sm" style={{ color: "var(--text)" }}>
        {value}
      </p>
    </div>
  );
}

export default async function AccountPage() {
  const identity = await getAccountIdentity();
  if (!identity) redirect("/login");

  const { profile, athlete } = identity;
  const roleLabel = ROLE_LABELS[profile.role] ?? "Account";
  const isAthlete = profile.role === "athlete";
  const isClubStaff = profile.role === "club_practitioner" || profile.role === "club_manager";

  const specialtyLabel =
    SPECIALTIES.find((s) => s.value === profile.specialty)?.label ?? profile.specialty ?? "Not set";
  const departmentLabel =
    profile.department === "medical" ? "Medical" : profile.department === "technical" ? "Technical" : "Not set";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          My Account
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Signed in as {roleLabel}.
        </p>
      </div>

      {/* Identity. Editable for staff and oversight roles; read-only for a
          Club Athlete, whose name is held by their club — see below. */}
      {isAthlete ? (
        <Section
          title="Your details"
          hint="Held by your club, because they appear on your official reports."
        >
          {athlete ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Read label="First name" value={athlete.first_name} />
              <Read label="Last name" value={athlete.last_name} />
              <Read label="Athlete code" value={athlete.code} />
              <Read label="Club" value={athlete.clubName ?? "—"} />
              <Read label="Email" value={profile.email} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Read label="Email" value={profile.email} />
            </div>
          )}

          {/* docs/02-roles-and-permissions.md, Club Athlete: "Zero
              self-editable fields". Saying who CAN change it matters more than
              saying they can't — otherwise this reads as a dead end. */}
          <p
            className={NOTICE}
            style={{ borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "var(--bg)" }}
          >
            Your name and club details are maintained by your club. If something here is wrong,
            message your practitioner and they can correct it. Your password below is yours alone.
          </p>
        </Section>
      ) : (
        <Section title="Your details" hint="Your name as it appears across Bridgetx.">
          <NameForm
            firstName={profile.first_name ?? ""}
            lastName={profile.last_name ?? ""}
            email={profile.email}
          />
        </Section>
      )}

      {/* Club Practitioners and Club Managers only. Specialty and department
          decide the default clinical-data tier (docs/02-roles-and-permissions.md,
          "Departments"), so they are set by whoever manages the staff record —
          never self-selected here. */}
      {isClubStaff && (
        <Section
          title="Staff record"
          hint="Set by your club, not here — your department decides your default clinical-data access."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Read label="Role" value={roleLabel} />
            <Read label="Specialty" value={specialtyLabel} />
            <Read label="Department" value={departmentLabel} />
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Your work history across clubs and teams lives on{" "}
            <Link href="/staff/profile" className="underline-offset-2 hover:underline" style={{ color: "var(--brand-blue)" }}>
              My Profile
            </Link>
            .
          </p>
        </Section>
      )}

      <Section title="Password" hint="Changing this signs you in with the new password next time.">
        <PasswordForm email={profile.email} />
      </Section>
    </div>
  );
}
