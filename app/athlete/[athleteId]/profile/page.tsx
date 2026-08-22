import type { Metadata } from "next";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { CARD, NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "Profile — Bridgetx" };

// STRICTLY view-only. docs/02-roles-and-permissions.md, Club Athlete:
// "Zero self-editable fields — not even profile photo (added by club staff,
// since it's used in official reports)."
//
// That rule is honoured structurally here: this page renders no <form>, no
// input, and no server action. There is nothing to submit, so there is no
// write path to secure — rather than rendering disabled inputs, which look
// like a temporarily-locked form and invite someone to "just enable" them
// later. If self-editing is ever introduced for another athlete type, it
// belongs in the /independent/[athleteId] tree, not here.

type AthleteRow = {
  first_name: string;
  last_name: string;
  code: string;
  country: string | null;
  dob: string | null;
  gender: string | null;
  ethnicity: string | null;
  sport: string;
  position: string | null;
  tier: string | null;
  diet_preference: string | null;
  height_cm: number | null;
  profile_photo_url: string | null;
  status: string | null;
  created_at: string;
  clubs: { name: string } | null;
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="text-sm" style={{ color: "var(--text)" }}>
        {value && value.trim() ? value : "—"}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className={`flex flex-col gap-4 ${CARD} p-5`}
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

function ageFromDob(dob: string | null): string | null {
  if (!dob) return null;
  const b = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return `${age}`;
}

export default async function AthleteProfilePage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const { athleteId } = await params;
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  // "athlete reads own row" RLS scopes this to the caller's own athlete row.
  //
  // The club NAME comes from the athlete_own_club view (migration 050), not a
  // `clubs(name)` embed: `clubs` has no athlete read policy, so the embed was
  // always null and every athlete saw "No club" here. The view is the narrow,
  // column-scoped read path — same pattern as the consultants' view in 025.
  const [{ data, error }, { data: ownClub }] = await Promise.all([
    supabase
      .from("athletes")
      .select(
        "first_name, last_name, code, country, dob, gender, ethnicity, sport, position, tier, diet_preference, height_cm, profile_photo_url, status, created_at"
      )
      .eq("id", athleteId)
      .maybeSingle(),
    supabase.from("athlete_own_club").select("name").maybeSingle(),
  ]);

  const athlete = data
    ? ({ ...(data as unknown as Omit<AthleteRow, "clubs">), clubs: ownClub?.name ? { name: ownClub.name } : null } as AthleteRow)
    : null;

  // Photo lives in the private profile-photos bucket, so it needs a
  // short-lived signed URL rather than a public link.
  let photoUrl: string | null = null;
  if (athlete?.profile_photo_url) {
    const { data: signed } = await supabase.storage
      .from("profile-photos")
      .createSignedUrl(athlete.profile_photo_url, 300);
    photoUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Profile
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Your details as your club holds them.
        </p>
      </div>

      {error && (
        <p
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load your profile: {error.message}
        </p>
      )}

      {!error && athlete && (
        <>
          <div
            className={`flex flex-wrap items-center gap-5 ${CARD} p-5`}
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            {photoUrl ? (
              <Image
                src={photoUrl}
                alt={`${athlete.first_name} ${athlete.last_name}`}
                width={72}
                height={72}
                className="h-18 w-18 rounded-full object-cover"
                style={{ height: 72, width: 72 }}
                unoptimized
              />
            ) : (
              <div
                className="flex items-center justify-center rounded-full text-xl font-semibold text-white"
                style={{ height: 72, width: 72, backgroundImage: "var(--brand-gradient-action)" }}
              >
                {athlete.first_name.charAt(0)}
                {athlete.last_name.charAt(0)}
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <p className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
                {athlete.first_name} {athlete.last_name}
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {athlete.clubs?.name ?? "No club"} · {athlete.sport}
                {athlete.position ? ` · ${athlete.position}` : ""}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                {athlete.code}
              </p>
            </div>
          </div>

          <Section title="Identity">
            <Field label="First name" value={athlete.first_name} />
            <Field label="Last name" value={athlete.last_name} />
            <Field label="Athlete code" value={athlete.code} />
            <Field label="Date of birth" value={athlete.dob} />
            <Field label="Age" value={ageFromDob(athlete.dob)} />
            <Field label="Gender" value={athlete.gender} />
            <Field label="Country" value={athlete.country} />
            <Field label="Ethnicity" value={athlete.ethnicity} />
            <Field label="Email" value={profile?.email ?? null} />
          </Section>

          <Section title="Sport">
            <Field label="Club" value={athlete.clubs?.name ?? null} />
            <Field label="Sport" value={athlete.sport} />
            <Field label="Position" value={athlete.position} />
            <Field label="Tier" value={athlete.tier} />
            <Field label="Status" value={athlete.status} />
            <Field label="Member since" value={athlete.created_at.slice(0, 10)} />
          </Section>

          <Section title="Nutrition profile">
            <Field label="Diet preference" value={athlete.diet_preference} />
            <Field label="Height" value={athlete.height_cm !== null ? `${athlete.height_cm} cm` : null} />
          </Section>

          <p
            className={NOTICE}
            style={{
              borderColor: "var(--border)",
              color: "var(--text-muted)",
              backgroundColor: "var(--bg)",
            }}
          >
            These details — including your photo — are maintained by your club, because they appear
            on official reports. If something here is wrong, message your practitioner and they can
            correct it.
          </p>
        </>
      )}
    </div>
  );
}
