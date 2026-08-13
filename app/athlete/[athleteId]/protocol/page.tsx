import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";
import { BADGE, CARD, NOTICE, PANEL } from "@/lib/ui";
import {
  activeOn,
  endedBefore,
  protocolWindowLabel,
  scheduledAfter,
  todayIso,
} from "@/lib/supplementProtocols";

export const metadata: Metadata = { title: "My Protocol — Bridgetx" };

// Athlete-facing view of the athlete's current supplement prescriptions, plus
// what is scheduled to start and the history of what came before.
//
// Access: "athlete reads own protocol" RLS (is_own_athlete_profile) is the
// athlete's ONLY policy on supplement_protocols — there is no insert or update
// for them, so this page has no write path to secure. A protocol is prescribed
// TO an athlete, never by them (docs/02-roles-and-permissions.md).
//
// The clinical and commercial layers are shown separately and labelled,
// because they mean different things: the supplement_library entry is what was
// clinically prescribed, the product is which branded item fulfils it through
// the club's prescription brand. See migration 020 for why the row carries
// both rather than free text.
//
// ---------------------------------------------------------------------------
// WHAT MIGRATION 035 CHANGED HERE
// ---------------------------------------------------------------------------
// This page used to render ONE active prescription — `rows.find(r => r.end_date
// === null)` — because that was all the schema could hold. An athlete now holds
// several at once (creatine + iron + omega-3), so the active block is a list.
//
// It also gains a third state. A protocol is now a date RANGE, so a plan the
// practitioner confirmed for next week is a real, committed prescription that
// has not started yet. It is shown, clearly labelled as scheduled, rather than
// hidden until its start date — hiding it would mean an athlete could not see
// what they have been put on until the morning it begins.
//
// NOTHING UNCONFIRMED APPEARS HERE, and that is structural rather than a filter
// on this page: an AI suggestion from the bulk planner is never written to
// supplement_protocols until the practitioner confirms it, so there is no
// unconfirmed row for this query to exclude. See app/staff/[teamId]/reports/
// nutrition/actions.ts.

type ProtocolRow = {
  id: string;
  supplement_name: string;
  dose: string;
  timing: string;
  rationale: string | null;
  start_date: string;
  end_date: string | null;
  supplement_library: { name: string; category: string; evidence_grade: string | null } | null;
  products: { name: string; brands: { name: string } | null } | null;
  prescriber: { first_name: string | null; last_name: string | null; specialty: string | null } | null;
};

function personName(p: { first_name: string | null; last_name: string | null } | null): string {
  if (!p) return "your practitioner";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "your practitioner";
}

function Detail({ label, value }: { label: string; value: string }) {
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

// One card per prescription. Identical layout in the active and scheduled
// sections — the same prescription should not change shape depending on
// whether it has started — with only the badge and the date line differing.
function ProtocolCard({
  row,
  today,
  tone,
}: {
  row: ProtocolRow;
  today: string;
  tone: "active" | "scheduled";
}) {
  const accent = tone === "active" ? "var(--success)" : "var(--brand-blue)";
  return (
    <div
      className={`flex flex-col gap-5 ${CARD} p-6`}
      style={{
        borderColor: tone === "active" ? "var(--brand-teal)" : "var(--border)",
        backgroundColor: "var(--surface)",
      }}
    >
      <div>
        <span
          className={BADGE}
          style={{
            backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`,
            color: accent,
          }}
        >
          {tone === "active" ? "Active" : "Scheduled"}
        </span>
        <p
          className="mt-2 text-xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          {row.supplement_name}
        </p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          Prescribed by {personName(row.prescriber)}
          {row.prescriber?.specialty ? ` · ${row.prescriber.specialty}` : ""} ·{" "}
          {protocolWindowLabel(row, today)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Dose" value={row.dose} />
        <Detail label="Timing" value={row.timing} />
        <Detail
          label="Clinical category"
          value={
            row.supplement_library
              ? `${row.supplement_library.category}${
                  row.supplement_library.evidence_grade
                    ? ` · evidence ${row.supplement_library.evidence_grade}`
                    : ""
                }`
              : "Not mapped to the clinical library"
          }
        />
        <Detail
          label="Product"
          value={
            row.products
              ? `${row.products.name}${row.products.brands ? ` (${row.products.brands.name})` : ""}`
              : "No specific product assigned"
          }
        />
      </div>

      {row.rationale && (
        <div
          className={`${PANEL} p-4`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
        >
          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Why you&apos;re taking this
          </p>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text)" }}>
            {row.rationale}
          </p>
        </div>
      )}
    </div>
  );
}

export default async function MyProtocolPage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const { athleteId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("supplement_protocols")
    .select(
      "id, supplement_name, dose, timing, rationale, start_date, end_date, " +
        "supplement_library(name, category, evidence_grade), " +
        "products(name, brands(name)), " +
        "prescriber:profiles!prescribed_by(first_name, last_name, specialty)"
    )
    .eq("athlete_id", athleteId)
    .order("start_date", { ascending: false });

  const rows = (data ?? []) as unknown as ProtocolRow[];
  const today = todayIso();
  const active = activeOn(rows, today);
  // Ascending: the next thing to start is the one the athlete cares about
  // first, which is the opposite of how history reads.
  const scheduled = scheduledAfter(rows, today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = endedBefore(rows, today);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          My Protocol
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          What your practitioner has prescribed, and why. This view is read-only — message your
          practitioner if anything needs to change.
        </p>
      </div>

      {error && (
        <p
          role="status"
          className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          Couldn&apos;t load your protocol: {error.message}
        </p>
      )}

      {!error && rows.length === 0 && (
        <EmptyState message="No supplement protocol has been prescribed for you yet. Your practitioner sets this up after reviewing your assessments." />
      )}

      {/* Distinguishes "nothing running today but something starts soon" from
          "nothing running today, full stop". Under the old one-row model these
          were the same state; with dated plans they are not, and telling an
          athlete they have no protocol while one starts on Monday would be
          wrong. */}
      {!error && active.length === 0 && rows.length > 0 && (
        <p
          className={NOTICE}
          style={{
            borderColor: "var(--warning)",
            color: "var(--text)",
            backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
          }}
        >
          {scheduled.length > 0 ? (
            <>
              Nothing to take today — your next prescription starts on {scheduled[0].start_date}.
              It&apos;s listed below.
            </>
          ) : (
            <>
              You have no active protocol right now — your previous one ended on {past[0]?.end_date}.
              Your history is below.
            </>
          )}
        </p>
      )}

      {!error && active.length > 0 && (
        <div className="flex flex-col gap-4">
          {/* Named and counted, because "one prescription" was the old mental
              model and a reader scanning quickly needs to see that several run
              at once rather than assume the first card is all of it. */}
          <h2
            className="text-lg font-semibold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
          >
            Taking now
            <span className="ml-2 text-sm font-normal" style={{ color: "var(--text-muted)" }}>
              {active.length} supplement{active.length === 1 ? "" : "s"}
            </span>
          </h2>
          {active.map((r) => (
            <ProtocolCard key={r.id} row={r} today={today} tone="active" />
          ))}
        </div>
      )}

      {!error && scheduled.length > 0 && (
        <div className="flex flex-col gap-4">
          <div>
            <h2
              className="text-lg font-semibold"
              style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
            >
              Starting soon
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              Already prescribed for you — these begin on the dates shown, and will appear on your
              daily check-in from then.
            </p>
          </div>
          {scheduled.map((r) => (
            <ProtocolCard key={r.id} row={r} today={today} tone="scheduled" />
          ))}
        </div>
      )}

      {!error && past.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2
            className="text-lg font-semibold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
          >
            Previous protocols
          </h2>
          <div
            className={`overflow-x-auto ${CARD}`}
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
          >
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Supplement", "Dose", "Timing", "Product", "Prescribed by", "From", "To"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
                {past.map((r, i) => (
                  <tr key={r.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <td className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                      {r.supplement_name}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text)" }}>{r.dose}</td>
                    <td className="px-5 py-3" style={{ color: "var(--text)" }}>{r.timing}</td>
                    <td className="px-5 py-3" style={{ color: "var(--text)" }}>{r.products?.name ?? "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text-muted)" }}>
                      {personName(r.prescriber)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text-muted)" }}>{r.start_date}</td>
                    <td className="whitespace-nowrap px-5 py-3" style={{ color: "var(--text-muted)" }}>{r.end_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
