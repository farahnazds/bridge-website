// The ONE authoritative list of environment variables this app needs.
//
// Exists because of a real production incident (2026-08-16): ANTHROPIC_API_KEY
// was never configured in Vercel, and nothing said so — the app built, booted
// and served every page fine while all seven AI call sites failed one
// practitioner at a time with an SDK auth error. A missing variable must fail
// LOUDLY AND EARLY, not feature-by-feature in front of a pilot user.
//
// Enforced in two places, both importing this file:
//   - next.config.ts   — BUILD-TIME GATE. A missing/malformed required var
//     fails the build, so Vercel keeps the previous deployment live and the
//     failure is a red deploy in the dashboard, not a broken production.
//   - app/api/health/route.ts — RUNTIME CHECK. GET /api/health answers
//     "is every required variable present in THIS running deployment?"
//     for any environment, any time.
//
// docs/PROJECT-STATUS.md carries the human-readable table; THIS file is the
// machine truth. Add every new variable here in the same change that
// introduces it — the build gate makes forgetting it in Vercel impossible to
// miss, but only for variables this list knows about.
//
// Deliberately dependency-free and without "server-only": next.config.ts
// evaluates it outside the Next runtime. Never import anything here.

export interface EnvVarSpec {
  name: string;
  /** What breaks without it — the message a failing check prints. */
  usedFor: string;
  /** Cheap sanity check on the value's shape, not its validity upstream. */
  shape: RegExp;
  /** English description of the expected shape, for error messages. */
  shapeHint: string;
  /** required: build fails. optional: build warns (a fallback exists). */
  level: "required" | "optional";
}

export const ENV_MANIFEST: EnvVarSpec[] = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    usedFor: "every database, auth and storage call",
    shape: /^https:\/\/[a-z0-9]+\.supabase\.co$/,
    shapeHint: "https://<ref>.supabase.co",
    level: "required",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    usedFor: "every browser/RLS database call and sign-in",
    shape: /^(eyJ|sb_)[A-Za-z0-9_.-]{20,}$/,
    shapeHint: "a Supabase anon key (JWT 'eyJ…' or 'sb_…')",
    level: "required",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    usedFor:
      "server-side writes that bypass RLS: public booking, clinical library, compliance alert fan-out, admin client",
    shape: /^(eyJ|sb_)[A-Za-z0-9_.-]{20,}$/,
    shapeHint: "a Supabase service-role key (JWT 'eyJ…' or 'sb_…')",
    level: "required",
  },
  {
    name: "ANTHROPIC_API_KEY",
    usedFor:
      "ALL AI generation — the Nutrition Planner and every report generator (seven call sites)",
    shape: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    shapeHint: "sk-ant-…",
    level: "required",
  },
  {
    name: "RESEND_API_KEY",
    usedFor: "every outbound email: report shared, compliance alerts, lead notifications",
    shape: /^re_[A-Za-z0-9_-]{10,}$/,
    shapeHint: "re_…",
    level: "required",
  },
  {
    name: "CRON_SECRET",
    usedFor:
      "authenticating the daily compliance cron (/api/cron/compliance-check); without it the job silently never runs",
    shape: /^.{16,}$/,
    shapeHint: "at least 16 characters",
    level: "required",
  },
  {
    name: "RESEND_FROM_EMAIL",
    usedFor:
      "the From address on every email; without it a hardcoded fallback is used, which may not match the verified sending domain",
    shape: /^(.+<[^\s@]+@[^\s@]+\.[^\s@]+>|[^\s@]+@[^\s@]+\.[^\s@]+)$/,
    shapeHint: '"Name <email@domain>" or a bare address',
    level: "optional",
  },
  {
    name: "AUTH_CONTEXT_SECRET",
    usedFor:
      "signing the middleware auth-context header (a per-request performance optimisation); absent, every request falls back to a full getUser() round trip",
    shape: /^.{16,}$/,
    shapeHint: "at least 16 characters",
    level: "optional",
  },
  {
    name: "NEXT_PUBLIC_SITE_URL",
    usedFor:
      "absolute origins in outbound email links; absent, the request's own host is used, which is correct on the canonical domain",
    shape: /^https?:\/\/.+$/,
    shapeHint: "an absolute URL",
    level: "optional",
  },

  // --- Google Calendar (Book-a-Meeting) -------------------------------------
  // All four are OPTIONAL on purpose. lib/booking.ts ships a working
  // placeholder — a weekday slot grid that records a REQUEST rather than a
  // confirmed booking — so an unconfigured calendar degrades to the honest
  // pre-integration behaviour instead of failing the build. Promote these to
  // "required" only once the placeholder is gone and a missing variable would
  // genuinely mean a broken booking page.
  //
  // NOTE ON WHITESPACE: checkEnv trims before testing, and dotenv trims
  // .env.local, but the VERCEL dashboard does not trim what you paste. A
  // leading space on any of these reaches Google verbatim and comes back as an
  // opaque `invalid_client`. All three were pasted with a leading space on
  // 2026-08-22; the shapes below are anchored so that recurring shows up as a
  // malformed-variable failure rather than a runtime mystery.
  {
    name: "GOOGLE_OAUTH_CLIENT_ID",
    usedFor:
      "the Google Calendar consent flow (/api/google/oauth/start) and every access-token refresh",
    shape: /^\d+-[A-Za-z0-9_]+\.apps\.googleusercontent\.com$/,
    shapeHint: "<digits>-<id>.apps.googleusercontent.com",
    level: "optional",
  },
  {
    name: "GOOGLE_OAUTH_CLIENT_SECRET",
    usedFor: "exchanging the authorisation code, and refreshing the access token thereafter",
    shape: /^GOCSPX-[A-Za-z0-9_-]{10,}$/,
    shapeHint: "GOCSPX-…",
    level: "optional",
  },
  {
    name: "GOOGLE_CALENDAR_ID",
    usedFor: "which calendar availability is read from and booking events are written to",
    shape: /^(primary|[^\s@]+@[^\s@]+\.[^\s@]+)$/,
    shapeHint: '"primary" or a calendar address ending @group.calendar.google.com',
    level: "optional",
  },
  {
    name: "GOOGLE_OAUTH_REFRESH_TOKEN",
    usedFor:
      "acting on the owner's calendar unattended; minted ONCE via /api/google/oauth/start and pasted here. Without it, availability and booking stay on the placeholder path",
    shape: /^1\/\/[A-Za-z0-9_/-]{20,}$/,
    shapeHint: "1//… (issued by Google, shown once by the OAuth callback)",
    level: "optional",
  },
];

export interface EnvCheckResult {
  ok: boolean;
  missing: { name: string; usedFor: string }[];
  malformed: { name: string; usedFor: string; shapeHint: string }[];
  optionalMissing: string[];
}

/** Pure: reads only the env object it is given, so both the build gate and
 *  the health route (and any test) check identically. */
export function checkEnv(env: Record<string, string | undefined>): EnvCheckResult {
  const missing: EnvCheckResult["missing"] = [];
  const malformed: EnvCheckResult["malformed"] = [];
  const optionalMissing: string[] = [];
  for (const spec of ENV_MANIFEST) {
    const value = (env[spec.name] ?? "").trim();
    if (!value) {
      if (spec.level === "required") missing.push({ name: spec.name, usedFor: spec.usedFor });
      else optionalMissing.push(spec.name);
      continue;
    }
    if (!spec.shape.test(value)) {
      malformed.push({ name: spec.name, usedFor: spec.usedFor, shapeHint: spec.shapeHint });
    }
  }
  return { ok: missing.length === 0 && malformed.length === 0, missing, malformed, optionalMissing };
}
