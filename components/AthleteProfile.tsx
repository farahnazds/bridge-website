import Link from "next/link";
import AthleteIdentityForm from "@/components/AthleteIdentityForm";
import { COMPLIANCE_WINDOW, type AthleteProfileData } from "@/lib/athleteProfile";
import { goalBodyWeightKg, gap } from "@/lib/bodyComposition";
import { REPORT_TYPE_LABELS, INJURY_STATUSES, RTP_PHASES } from "@/lib/constants";
import { BADGE, CARD, NOTICE_EMPTY } from "@/lib/ui";

// The staff-facing athlete profile, rendered identically for the Club Manager
// route and the Club Practitioner route. Only `links` differs, so each role
// deep-links into the dedicated pages its own dashboard actually has.
//
// Every section below is READ-ONLY except identity. Data entry stays in the
// existing validated pages — this view links out to them rather than
// reimplementing their forms, which is what would drift.

export interface ProfileLinks {
  assessments: string | null;
  injuries: string | null;
  gps: string | null;
  vald: string | null;
  reports: string | null;
  protocol: string | null;
  back: { href: string; label: string };
}

const STATUS_COLOR: Record<string, string> = {
  active: "var(--danger)",
  recovering: "var(--warning)",
  cleared: "var(--success)",
};

function Section({
  title, href, hint, children,
}: {
  title: string; href?: string | null; hint?: string; children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          {title}
        </h2>
        {href && (
          <Link href={href} className="text-xs font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--brand-blue)" }}>
            Open {title} →
          </Link>
        )}
      </div>
      {hint && <p className="-mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{hint}</p>}
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className={NOTICE_EMPTY}
      style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
      {children}
    </p>
  );
}

function Card({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className={`${CARD} p-4`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="mt-1 text-xl font-semibold"
        style={{ fontFamily: "var(--font-heading)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{hint}</p>}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className={`overflow-x-auto ${CARD}`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const num = (v: number | null, digits = 1, suffix = "") =>
  v === null || v === undefined ? "—" : `${Number(v).toFixed(digits)}${suffix}`;

export default function AthleteProfile({
  data, links, canEdit, viewerNote,
}: {
  data: AthleteProfileData; links: ProfileLinks; canEdit: boolean; viewerNote?: string;
}) {
  const { athlete, compliance, assessments, injuries, vald, gps, reports } = data;
  const latest = assessments[0] ?? null;
  const previous = assessments[1] ?? null;
  const delta = (a: number | null | undefined, b: number | null | undefined) =>
    typeof a === "number" && typeof b === "number" ? a - b : null;
  const bfDelta = delta(latest?.body_fat_pct, previous?.body_fat_pct);
  const wtDelta = delta(latest?.weight_kg, previous?.weight_kg);

  const hasGoal = athlete.goal_body_fat_pct !== null || athlete.goal_lean_mass_kg !== null;
  const goalWeight = goalBodyWeightKg({
    goalBodyFatPct: athlete.goal_body_fat_pct,
    goalLeanMassKg: athlete.goal_lean_mass_kg,
  });
  const bfToGoal = gap(latest?.body_fat_pct ?? null, athlete.goal_body_fat_pct);
  const lmToGoal = gap(latest?.lean_mass_kg ?? null, athlete.goal_lean_mass_kg);
  const wtToGoal = gap(latest?.weight_kg ?? null, goalWeight);
  const openInjuries = injuries.filter((i) => i.status !== "cleared");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={links.back.href} className="text-xs" style={{ color: "var(--brand-blue)" }}>
          ← {links.back.label}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            {athlete.first_name} {athlete.last_name}
          </h1>
          <span className={BADGE}
            style={{
              backgroundColor: `color-mix(in srgb, ${athlete.status === "read_only" ? "var(--warning)" : "var(--success)"} 12%, transparent)`,
              color: athlete.status === "read_only" ? "var(--warning)" : "var(--success)",
            }}>
            {athlete.status === "read_only" ? "Read-only" : "Active"}
          </span>
          {openInjuries.length > 0 && (
            <span className={BADGE}
              style={{ backgroundColor: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }}>
              {openInjuries.length} open injur{openInjuries.length === 1 ? "y" : "ies"}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: ".8rem" }}>
          {athlete.code}
          {data.teams.length > 0 && (
            <span style={{ fontFamily: "var(--font-body)" }}> · {data.teams.map((t) => t.name).join(", ")}</span>
          )}
        </p>
        {viewerNote && <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{viewerNote}</p>}
      </div>

      <AthleteIdentityForm athlete={athlete} clubId={athlete.club_id} canEdit={canEdit} />

      {/* Clinical flags sit beside identity because they gate supplement rules,
          but they are not editable here — they live in three vocabulary-backed
          join tables and need their own surface. */}
      <div className={`${CARD} p-5`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
        <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Clinical flags
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {([["Conditions", data.conditions], ["Allergies", data.allergies], ["Intolerances", data.intolerances]] as const).map(
            ([label, items]) => (
              <div key={label}>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
                <p className="mt-0.5 text-sm" style={{ color: items.length ? "var(--text)" : "var(--text-muted)" }}>
                  {items.length ? items.join(", ") : "None recorded"}
                </p>
              </div>
            )
          )}
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Recorded at registration. Not editable here yet.
        </p>
      </div>

      <Section title="Supplement protocol" href={links.protocol}
        hint="One active prescription at a time; a new one supersedes the last rather than deleting it.">
        {data.activeProtocol ? (
          <div className={`${CARD} p-5`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{data.activeProtocol.supplement_name}</p>
              <span className={BADGE}
                style={{ backgroundColor: "color-mix(in srgb, var(--success) 12%, transparent)", color: "var(--success)" }}>
                Active
              </span>
            </div>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {[data.activeProtocol.dose, data.activeProtocol.timing].filter(Boolean).join(" · ") || "No dose recorded"}
              {data.activeProtocol.start_date ? ` · since ${data.activeProtocol.start_date}` : ""}
            </p>
            {data.activeProtocol.rationale && (
              <p className="mt-2 text-sm" style={{ color: "var(--text)" }}>{data.activeProtocol.rationale}</p>
            )}
          </div>
        ) : (
          <Empty>No active protocol.</Empty>
        )}
        {data.pastProtocols.length > 0 && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {data.pastProtocols.length} superseded prescription{data.pastProtocols.length === 1 ? "" : "s"} kept in history.
          </p>
        )}
      </Section>

      <Section title="Body composition" href={links.assessments} hint="Latest assessment, and the change since the one before it.">
        {latest ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card label="Weight" value={num(latest.weight_kg, 1, " kg")}
              hint={wtDelta === null ? `as of ${latest.date}` : `${wtDelta >= 0 ? "+" : ""}${wtDelta.toFixed(1)} kg since ${previous?.date}`} />
            <Card label="Body fat" value={num(latest.body_fat_pct, 1, "%")}
              hint={bfDelta === null ? `as of ${latest.date}` : `${bfDelta >= 0 ? "+" : ""}${bfDelta.toFixed(1)} pts since ${previous?.date}`} />
            <Card label="Lean mass" value={num(latest.lean_mass_kg, 1, " kg")} />
            <Card label="Assessments" value={assessments.length} hint={`latest ${latest.date}`} />
          </div>
        ) : (
          <Empty>No assessments recorded.</Empty>
        )}

        {/* Goal row, deliberately beside the current figures rather than in the
            identity block — a goal is only meaningful next to where the athlete
            actually is. Derived weight uses the shared helper so the profile and
            both prompts can never disagree on the formula. */}
        {hasGoal ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card label="Goal body fat"
              value={athlete.goal_body_fat_pct !== null ? `${athlete.goal_body_fat_pct}%` : "—"}
              hint={bfToGoal === null ? "no current reading" : bfToGoal === 0 ? "at goal" : `${Math.abs(bfToGoal)} pts ${bfToGoal > 0 ? "to lose" : "below goal"}`} />
            <Card label="Goal lean mass"
              value={athlete.goal_lean_mass_kg !== null ? `${athlete.goal_lean_mass_kg} kg` : "—"}
              hint={lmToGoal === null ? "no current reading" : lmToGoal === 0 ? "at goal" : `${Math.abs(lmToGoal)} kg ${lmToGoal < 0 ? "to gain" : "above goal"}`} />
            <Card label="Goal body weight"
              value={goalWeight !== null ? `${goalWeight} kg` : "—"}
              hint={goalWeight === null ? "needs both goal values" : wtToGoal === null ? "no current weight" : wtToGoal === 0 ? "at goal" : `${Math.abs(wtToGoal)} kg ${wtToGoal > 0 ? "to lose" : "to gain"}`} />
          </div>
        ) : (
          <Empty>No body-composition goal set for this athlete.</Empty>
        )}
      </Section>

      <Section title="Compliance" href={null} hint={`Daily check-ins over the last ${COMPLIANCE_WINDOW} days.`}>
        {compliance.total > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card label="Check-in rate" value={`${compliance.rate}%`} hint={`${compliance.completed} of ${compliance.total}`} />
            <Card label="Skipped" value={compliance.skipped} hint={compliance.lastDate ? `last ${compliance.lastDate}` : ""} />
            <Card label="Avg nutrition" value={num(compliance.avgNutrition)} />
            <Card label="Avg sleep" value={num(compliance.avgSleep)} />
          </div>
        ) : (
          <Empty>No check-ins in the last {COMPLIANCE_WINDOW} days.</Empty>
        )}
      </Section>

      <Section title="Injuries" href={links.injuries}>
        {injuries.length === 0 ? (
          <Empty>No injuries recorded.</Empty>
        ) : (
          <Table head={["Date", "Type", "Status", "RTP phase", "Target return"]}>
            {injuries.map((inj, i) => {
              const color = STATUS_COLOR[inj.status ?? ""] ?? "var(--text-muted)";
              return (
                <tr key={inj.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <td className="px-5 py-3" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{inj.date}</td>
                  <td className="px-5 py-3 font-medium" style={{ color: "var(--text)" }}>{inj.type ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className={BADGE}
                      style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
                      {INJURY_STATUSES.find((s) => s.value === inj.status)?.label ?? inj.status ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3" style={{ color: "var(--text)" }}>
                    {RTP_PHASES.find((p) => p.value === inj.rtp_phase)?.label ?? inj.rtp_phase ?? "—"}
                  </td>
                  <td className="px-5 py-3" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                    {inj.cleared_date ? `cleared ${inj.cleared_date}` : inj.target_return_date ?? "—"}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Section title="GPS" href={links.gps} hint="Five most recent sessions.">
          {gps.length === 0 ? <Empty>No GPS sessions recorded.</Empty> : (
            <Table head={["Date", "Distance", "m/min", "Max vel."]}>
              {gps.map((g, i) => (
                <tr key={g.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <td className="px-5 py-3" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{g.date}</td>
                  <td className="px-5 py-3" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{num(g.total_distance_m, 0, " m")}</td>
                  <td className="px-5 py-3" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{num(g.meters_per_min)}</td>
                  <td className="px-5 py-3" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{num(g.max_velocity)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section title="VALD" href={links.vald} hint="Five most recent tests.">
          {vald.length === 0 ? <Empty>No VALD tests recorded.</Empty> : (
            <Table head={["Date", "Test", "Asymmetry"]}>
              {vald.map((v, i) => {
                const high = typeof v.asymmetry_pct === "number" && Math.abs(v.asymmetry_pct) > 15;
                return (
                  <tr key={v.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <td className="px-5 py-3" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{v.date}</td>
                    <td className="px-5 py-3" style={{ color: "var(--text)" }}>{v.test_type ?? "—"}</td>
                    <td className="px-5 py-3" style={{ color: high ? "var(--danger)" : "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                      {num(v.asymmetry_pct, 1, "%")}
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Section>
      </div>

      <Section title="Reports" href={links.reports} hint="Eight most recent reports naming this athlete.">
        {reports.length === 0 ? <Empty>No reports generated for this athlete.</Empty> : (
          <Table head={["Generated", "Type", "Official", "PDF"]}>
            {reports.map((r, i) => (
              <tr key={r.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                <td className="px-5 py-3" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                  {String(r.created_at).slice(0, 10)}
                </td>
                <td className="px-5 py-3" style={{ color: "var(--text)" }}>
                  {(r.report_types ?? []).map((t) => REPORT_TYPE_LABELS[t] ?? t).join(", ")}
                </td>
                <td className="px-5 py-3" style={{ color: "var(--text-muted)" }}>{r.is_official ? "Yes" : "—"}</td>
                <td className="px-5 py-3">
                  {r.file_url ? (
                    <a href={r.file_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs underline-offset-2 hover:underline" style={{ color: "var(--brand-blue)" }}>
                      Download
                    </a>
                  ) : (
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}
