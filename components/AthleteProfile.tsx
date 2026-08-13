import Link from "next/link";
import AthleteIdentityForm from "@/components/AthleteIdentityForm";
import {
  InjuryRows,
  GpsRows,
  ValdRows,
  AssessmentRows,
  ReportRows,
  CommentRows,
  TrainingLoadRows,
  ThreadRows,
  type EntryEditContext,
} from "@/components/AthleteEntryRows";
import { COMPLIANCE_WINDOW, type AthleteProfileData } from "@/lib/athleteProfile";
import { goalBodyWeightKg, gap } from "@/lib/bodyComposition";
import { SectionQuickAdd, type QuickAddContext } from "@/components/QuickAddModals";
import GenerateReportAction from "@/components/GenerateReportAction";
import ComplianceDetailModal from "@/components/ComplianceDetailModal";
import { BADGE, CARD, NOTICE_EMPTY } from "@/lib/ui";
import { protocolWindowLabel } from "@/lib/supplementProtocols";

// The staff-facing athlete profile, rendered identically for the Club Manager
// route and the Club Practitioner route. Only `links` and `edit` differ, so
// each role deep-links into the dedicated pages its own dashboard actually has.
//
// Every data row here opens a modal with the full entry, and — on the team
// workspace route — the dedicated page's REAL edit form inside it. That form
// is imported, not rebuilt: see the header of components/AthleteEntryRows.tsx
// for what that buys and where editing is offered at all. This file stays a
// server component; only the row bodies are client, which is why the table
// shells and section headings still live here.

export interface ProfileLinks {
  // Reports is the only section that still deep-links out. The rest lost their
  // "Open …" buttons — the dedicated pages stay reachable from the sidebar, and
  // each section now offers a quick-add instead.
  reports: string | null;
  back: { href: string; label: string };
}

function Section({
  title, href, hint, action, children,
}: {
  title: string; href?: string | null; hint?: string;
  /** Quick-add "+" for this section, or nothing on routes that cannot write. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          {title}
        </h2>
        <div className="flex items-center gap-3">
          {action}
          {href && (
            <Link href={href} className="text-xs font-medium underline-offset-2 hover:underline"
              style={{ color: "var(--brand-blue)" }}>
              Open {title} →
            </Link>
          )}
        </div>
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

// The trailing empty header cell is the column the row components put their
// "open" chevron in — declared here so the header and body stay the same
// width, and given a scope-less blank label rather than a visible one.
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className={`overflow-x-auto ${CARD}`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>{h}</th>
            ))}
            <th className="py-3 pl-1 pr-3">
              <span className="sr-only">Open</span>
            </th>
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
  data, links, canEdit, edit, quickAdd = null, viewerNote,
}: {
  data: AthleteProfileData;
  links: ProfileLinks;
  canEdit: boolean;
  /** The team workspace whose edit forms the row modals may submit under, or
   *  null for a route that has no team in scope (the club dashboard), where
   *  the modals stay read-only. See components/AthleteEntryRows.tsx. */
  edit: EntryEditContext;
  /** Context for the per-section quick-add "+" buttons and Generate Report.
   *  Null wherever writing is not offered — the club route, for the same two
   *  reasons its row modals are read-only: no team_id in scope, and no
   *  data-entry pages of its own to mirror. See components/QuickAddModals.tsx. */
  quickAdd?: QuickAddContext | null;
  viewerNote?: string;
}) {
  const { athlete, compliance, assessments, injuries, vald, gps, reports, comments, trainingLoad, threads } = data;
  const latest = assessments[0] ?? null;
  const previous = assessments[1] ?? null;
  const delta = (a: number | null | undefined, b: number | null | undefined) =>
    typeof a === "number" && typeof b === "number" ? a - b : null;
  const bfDelta = delta(latest?.bodyFatPct, previous?.bodyFatPct);
  const wtDelta = delta(latest?.weightKg, previous?.weightKg);

  const hasGoal = athlete.goal_body_fat_pct !== null || athlete.goal_lean_mass_kg !== null;
  const goalWeight = goalBodyWeightKg({
    goalBodyFatPct: athlete.goal_body_fat_pct,
    goalLeanMassKg: athlete.goal_lean_mass_kg,
  });
  const bfToGoal = gap(latest?.bodyFatPct ?? null, athlete.goal_body_fat_pct);
  const lmToGoal = gap(latest?.leanMassKg ?? null, athlete.goal_lean_mass_kg);
  const wtToGoal = gap(latest?.weightKg ?? null, goalWeight);
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
          {/* Profile-level rather than section-level: generating a report is
              about the athlete as a whole, not about the Reports list. Opens
              the real tabbed generator with athlete selection already answered
              — the type tabs stay, because that is still a real choice. */}
          {quickAdd && (
            <div className="ml-auto">
              <GenerateReportAction teamId={quickAdd.teamId} athleteId={athlete.id} />
            </div>
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

      {/* Migration 035: several supplements run concurrently, each superseded
          on its own timeline, so this is a list. Scheduled rows are shown
          alongside active ones rather than folded into history — a plan
          confirmed for next week is committed, not past. */}
      <Section title="Supplement protocol"
        hint="One active prescription per supplement; a new one supersedes the last for that supplement rather than deleting it.">
        {data.activeProtocols.length > 0 || data.scheduledProtocols.length > 0 ? (
          <div className="flex flex-col gap-3">
            {[
              ...data.activeProtocols.map((p) => ({ row: p, tone: "active" as const })),
              ...data.scheduledProtocols.map((p) => ({ row: p, tone: "scheduled" as const })),
            ].map(({ row, tone }) => (
              <div key={row.id} className={`${CARD} p-5`}
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{row.supplement_name}</p>
                  <span className={BADGE}
                    style={
                      tone === "active"
                        ? { backgroundColor: "color-mix(in srgb, var(--success) 12%, transparent)", color: "var(--success)" }
                        : { backgroundColor: "color-mix(in srgb, var(--brand-blue) 12%, transparent)", color: "var(--brand-blue)" }
                    }>
                    {tone === "active" ? "Active" : "Scheduled"}
                  </span>
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                  {[row.dose, row.timing].filter(Boolean).join(" · ") || "No dose recorded"}
                  {` · ${protocolWindowLabel(row, data.protocolToday)}`}
                </p>
                {row.rationale && (
                  <p className="mt-2 text-sm" style={{ color: "var(--text)" }}>{row.rationale}</p>
                )}
              </div>
            ))}
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

      <Section title="Body composition" hint="Latest assessment, and the change since the one before it.">
        {latest ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card label="Weight" value={num(latest.weightKg, 1, " kg")}
              hint={wtDelta === null ? `as of ${latest.date}` : `${wtDelta >= 0 ? "+" : ""}${wtDelta.toFixed(1)} kg since ${previous?.date}`} />
            <Card label="Body fat" value={num(latest.bodyFatPct, 1, "%")}
              hint={bfDelta === null ? `as of ${latest.date}` : `${bfDelta >= 0 ? "+" : ""}${bfDelta.toFixed(1)} pts since ${previous?.date}`} />
            <Card label="Lean mass" value={num(latest.leanMassKg, 1, " kg")} />
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

      {/* The assessment history the cards above summarise. It exists as its
          own table because the cards can only ever show the latest two, and
          because a row is what opens the real assessment edit form. */}
      <Section title="Assessment history" hint="Ten most recent assessments."
        action={quickAdd && <SectionQuickAdd kind="assessment" ctx={quickAdd} label="Log an assessment for this athlete" />}>
        {assessments.length === 0 ? (
          <Empty>No assessments recorded.</Empty>
        ) : (
          <Table head={["Date", "Weight", "Body fat", "Lean mass", "Logged by"]}>
            <AssessmentRows entries={assessments} edit={edit} />
          </Table>
        )}
      </Section>

      <Section title="Compliance" href={null} hint={`Daily check-ins over the last ${COMPLIANCE_WINDOW} days.`}>
        <ComplianceDetailModal athleteId={athlete.id} athleteName={`${athlete.first_name} ${athlete.last_name}`}>
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
        </ComplianceDetailModal>
      </Section>

      {/* The planned counterpart to the actuals above, so it sits beside them
          rather than at the end. Individual entries only — a team-wide entry
          applies to this athlete but is not about them, and the club route has
          no team in scope to resolve one against. */}
      <Section title="Training load"
        hint="Plan entries written for this athlete specifically. Team-wide entries apply too and live on Load & Periodization."
        action={quickAdd && <SectionQuickAdd kind="training_load" ctx={quickAdd} label="Plan a session for this athlete" />}>
        {trainingLoad.length === 0 ? (
          <Empty>No individual plan entries for this athlete.</Empty>
        ) : (
          <Table head={["Date", "Intensity", "RPE", "Added by"]}>
            <TrainingLoadRows entries={trainingLoad} />
          </Table>
        )}
      </Section>

      <Section title="Injuries"
        action={quickAdd && <SectionQuickAdd kind="injury" ctx={quickAdd} label="Log an injury for this athlete" />}>
        {injuries.length === 0 ? (
          <Empty>No injuries recorded.</Empty>
        ) : (
          <Table head={["Date", "Type", "Status", "RTP phase", "Target return"]}>
            <InjuryRows entries={injuries} edit={edit} />
          </Table>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Section title="GPS" hint="Five most recent sessions."
          action={quickAdd && <SectionQuickAdd kind="gps" ctx={quickAdd} label="Add a GPS session for this athlete" />}>
          {gps.length === 0 ? <Empty>No GPS sessions recorded.</Empty> : (
            <Table head={["Date", "Distance", "m/min", "Max vel."]}>
              <GpsRows entries={gps} edit={edit} />
            </Table>
          )}
        </Section>

        <Section title="VALD" hint="Five most recent tests."
          action={quickAdd && <SectionQuickAdd kind="vald" ctx={quickAdd} label="Log a VALD test for this athlete" />}>
          {vald.length === 0 ? <Empty>No VALD tests recorded.</Empty> : (
            <Table head={["Date", "Test", "Asymmetry"]}>
              <ValdRows entries={vald} edit={edit} />
            </Table>
          )}
        </Section>
      </div>

      {/* Reports open a VIEW-ONLY modal — they are generated, not edited. */}
      <Section title="Reports" href={links.reports} hint="Eight most recent reports naming this athlete.">
        {reports.length === 0 ? <Empty>No reports generated for this athlete.</Empty> : (
          <Table head={["Generated", "Type", "Official", "PDF"]}>
            <ReportRows entries={reports} />
          </Table>
        )}
      </Section>

      {/* WHAT IS IN THIS LIST IS DECIDED BY RLS, NOT BY THIS COMPONENT.
          `comments` has no SELECT policy that returns another author's
          private_note — not for a Club Manager, not for an Admin — so a
          Private Note appearing here is always the reader's own. The hint
          states the rule the database enforces rather than describing a filter
          this file performs, because this file performs none. See the note on
          CommentEntry in lib/athleteProfile.ts. */}
      <Section title="Comments"
        hint="Official Comments from anyone with access to this athlete, plus your own Private Notes. Another author's Private Notes are never shown."
        action={quickAdd && <SectionQuickAdd kind="comment" ctx={quickAdd} label="Post a comment about this athlete" />}>
        {comments.length === 0 ? (
          <Empty>No comments about this athlete.</Empty>
        ) : (
          <Table head={["Date", "Type", "Comment", "Author"]}>
            <CommentRows entries={comments} />
          </Table>
        )}
      </Section>

      {/* Scoped to the viewer's own correspondence for the same reason: the
          messages policies only return threads the caller sent or received. */}
      <Section title="Messenger"
        hint="Your conversations with this athlete. Other staff members' conversations are not shown."
        action={quickAdd && athlete.profile_id
          ? <SectionQuickAdd kind="message" ctx={quickAdd} label="Message this athlete" />
          : undefined}>
        {threads.length === 0 ? (
          <Empty>
            {athlete.profile_id
              ? "No messages with this athlete."
              : "This athlete hasn't activated their account, so they can't be messaged yet."}
          </Empty>
        ) : (
          <Table head={["Latest", "Last message", "Messages", "Unread"]}>
            <ThreadRows entries={threads} />
          </Table>
        )}
      </Section>
    </div>
  );
}
