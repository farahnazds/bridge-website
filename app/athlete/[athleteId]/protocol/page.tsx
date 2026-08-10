import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";
import { BADGE, CARD, NOTICE, PANEL } from "@/lib/ui";

export const metadata: Metadata = { title: "My Protocol — Bridgetx" };

// Athlete-facing view of their current supplement prescription, plus the
// history of what came before it.
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
  const active = rows.find((r) => r.end_date === null) ?? null;
  const past = rows.filter((r) => r.end_date !== null);

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

      {!error && !active && rows.length > 0 && (
        <p
          className={NOTICE}
          style={{ borderColor: "var(--warning)", color: "var(--text)", backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)" }}
        >
          You have no active protocol right now — your previous one ended on{" "}
          {past[0]?.end_date}. Your history is below.
        </p>
      )}

      {!error && active && (
        <div
          className={`flex flex-col gap-5 ${CARD} p-6`}
          style={{ borderColor: "var(--brand-teal)", backgroundColor: "var(--surface)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span
                className={BADGE}
                style={{
                  backgroundColor: "color-mix(in srgb, var(--success) 12%, transparent)",
                  color: "var(--success)",
                }}
              >
                Active
              </span>
              <p
                className="mt-2 text-xl font-semibold"
                style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
              >
                {active.supplement_name}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                Prescribed by {personName(active.prescriber)}
                {active.prescriber?.specialty ? ` · ${active.prescriber.specialty}` : ""} · started{" "}
                {active.start_date}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Dose" value={active.dose} />
            <Detail label="Timing" value={active.timing} />
            <Detail
              label="Clinical category"
              value={
                active.supplement_library
                  ? `${active.supplement_library.category}${
                      active.supplement_library.evidence_grade
                        ? ` · evidence ${active.supplement_library.evidence_grade}`
                        : ""
                    }`
                  : "Not mapped to the clinical library"
              }
            />
            <Detail
              label="Product"
              value={
                active.products
                  ? `${active.products.name}${active.products.brands ? ` (${active.products.brands.name})` : ""}`
                  : "No specific product assigned"
              }
            />
          </div>

          {active.rationale && (
            <div
              className={`${PANEL} p-4`}
              style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}
            >
              <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Why you&apos;re taking this
              </p>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text)" }}>
                {active.rationale}
              </p>
            </div>
          )}
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
