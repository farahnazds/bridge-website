import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BADGE, CARD, NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "Billing — Bridgetx" };

// Read-only view of the club's subscription state.
//
// STRICTLY view-only, and not just because Stripe isn't wired up yet:
// docs/05-business-rules.md puts club contract dates under Super Admin
// ("Admin sets start/end date in Super Admin"), and stop/resume is a Super
// Admin action. A Club Manager sees their status; they do not set it. So this
// page renders no form, no input and no action — same approach as the athlete
// Profile page, rather than disabled controls that look temporarily locked.
//
// All four fields read straight off `clubs`, which is where club subscription
// state lives (the `subscriptions` table is individual-tier only — see its
// comment in database/schema.sql).

type ClubRow = {
  name: string;
  subscription_start: string | null;
  subscription_end: string | null;
  subscription_status: string;
  stopped_by_super_admin: boolean;
};

// Derived presentation state. The lifecycle in docs/05-business-rules.md is:
// natural expiry -> short read-only grace period -> full lockout, with a
// manual Super Admin stop/resume that is independent of the dates and must
// read as "Talk to support", never as an error.
type Derived = {
  label: string;
  detail: string;
  color: string;
  tone: "ok" | "warn" | "stopped";
};

const GRACE_DAYS = 14;

function derive(club: ClubRow, today: Date): Derived {
  // The manual override is checked FIRST and wins over the dates — a club
  // stopped by Super Admin inside a valid contract window is still stopped.
  if (club.stopped_by_super_admin || club.subscription_status === "stopped") {
    return {
      label: "Paused",
      detail:
        "Your account is currently paused. Your data is safe and nothing has been deleted — talk to support to resume.",
      color: "var(--text-muted)",
      tone: "stopped",
    };
  }

  const end = club.subscription_end ? new Date(club.subscription_end) : null;
  if (!end) {
    return {
      label: club.subscription_status === "grace_period" ? "Grace period" : "Active",
      detail: "No contract end date is recorded yet. Your Bridgetx administrator sets these dates.",
      color: club.subscription_status === "grace_period" ? "var(--warning)" : "var(--success)",
      tone: club.subscription_status === "grace_period" ? "warn" : "ok",
    };
  }

  const days = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);

  if (days >= 0) {
    const soon = days <= GRACE_DAYS;
    return {
      label: "Active",
      detail: soon
        ? `Your contract renews or ends in ${days} day${days === 1 ? "" : "s"}. Your Bridgetx administrator will be in touch before then.`
        : `Your contract runs to ${club.subscription_end}.`,
      color: soon ? "var(--warning)" : "var(--success)",
      tone: soon ? "warn" : "ok",
    };
  }

  const overdue = Math.abs(days);
  if (overdue <= GRACE_DAYS || club.subscription_status === "grace_period") {
    return {
      label: "Grace period",
      detail: `Your contract ended on ${club.subscription_end}. You have read-only access for a short period while it's renewed — talk to support to continue.`,
      color: "var(--warning)",
      tone: "warn",
    };
  }

  return {
    label: "Expired",
    detail: `Your contract ended on ${club.subscription_end}. Access is limited until it's renewed. Your data is safe and nothing has been deleted — talk to support.`,
    color: "var(--danger)",
    tone: "stopped",
  };
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="text-sm" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </p>
    </div>
  );
}

export default async function ClubBillingPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clubs")
    .select("name, subscription_start, subscription_end, subscription_status, stopped_by_super_admin")
    .eq("id", clubId)
    .maybeSingle();

  const club = data as ClubRow | null;
  const state = club ? derive(club, new Date()) : null;

  const contractLength =
    club?.subscription_start && club?.subscription_end
      ? `${Math.round(
          (new Date(club.subscription_end).getTime() - new Date(club.subscription_start).getTime()) / 86_400_000
        )} days`
      : "—";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Billing
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Your club&apos;s subscription status and contract dates.
        </p>
      </div>

      {error && (
        <p
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load billing details: {error.message}
        </p>
      )}

      {!error && club && state && (
        <>
          <div
            className={`flex flex-col gap-3 ${CARD} p-6`}
            style={{ borderColor: state.color, backgroundColor: "var(--surface)" }}
          >
            <span
              className={`w-fit ${BADGE}`}
              style={{
                backgroundColor: `color-mix(in srgb, ${state.color} 12%, transparent)`,
                color: state.color,
              }}
            >
              {state.label}
            </span>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>
              {state.detail}
            </p>
          </div>

          <div
            className={`grid grid-cols-1 gap-4 ${CARD} p-5 sm:grid-cols-2 lg:grid-cols-4`}
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            <Field label="Club" value={club.name} />
            <Field label="Contract start" value={club.subscription_start ?? "—"} />
            <Field label="Contract end" value={club.subscription_end ?? "—"} />
            <Field label="Contract length" value={contractLength} />
          </div>

          <p
            className={NOTICE}
            style={{ borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "var(--bg)" }}
          >
            Bridgetx clubs are billed on a yearly contract arranged directly with us — there&apos;s no
            card on file and nothing to pay here. Your contract dates are set by your Bridgetx
            administrator. If anything above looks wrong, talk to support.
          </p>
        </>
      )}
    </div>
  );
}
