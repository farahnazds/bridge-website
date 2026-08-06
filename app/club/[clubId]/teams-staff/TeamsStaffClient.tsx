"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { TEAM_CATEGORIES, OTHER_TEAM_CATEGORY, SPECIALTIES, OTHER_SPECIALTY } from "@/lib/constants";
import { createTeam, invitePractitioner, assignToTeam, type ActionState } from "./actions";

const initialState: ActionState = { error: null };

const inputClass =
  "rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-transparent focus:ring-2 focus:ring-[color:var(--brand-blue)]";
const inputStyle = {
  borderColor: "var(--border)",
  backgroundColor: "var(--surface)",
  color: "var(--text)",
};
const labelClass = "text-sm font-medium";

const DEPARTMENT_LABEL: Record<string, string> = { medical: "Medical", technical: "Technical" };
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  TEAM_CATEGORIES.map((c) => [c.value, c.label])
);

interface Team {
  id: string;
  name: string;
  category: string | null;
}

interface StaffMember {
  profileId: string;
  firstName: string;
  lastName: string;
  email: string;
  specialty: string;
  department: "medical" | "technical" | null;
  assignedTeams: { team_id: string; team_name: string }[];
}

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border px-4 py-3 text-sm"
      style={{
        borderColor: "var(--danger)",
        color: "var(--danger)",
        backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
      }}
    >
      {error}
    </p>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-[opacity,transform] duration-200 ease-out hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      style={{ backgroundImage: "var(--brand-gradient)" }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function CreateTeamForm({ clubId, onDone }: { clubId: string; onDone: () => void }) {
  const [state, formAction] = useActionState(createTeam, initialState);
  const [category, setCategory] = useState("");

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border p-4"
      style={{ borderColor: "var(--border)" }}
      noValidate
    >
      <input type="hidden" name="club_id" value={clubId} />
      <ErrorBanner error={state.error} />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="team_name" className={labelClass} style={{ color: "var(--text)" }}>
            Team name
          </label>
          <input id="team_name" name="name" type="text" required className={inputClass} style={inputStyle} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="team_category" className={labelClass} style={{ color: "var(--text)" }}>
            Category
          </label>
          {category === OTHER_TEAM_CATEGORY ? (
            <input
              id="team_category"
              name="category"
              type="text"
              required
              placeholder="e.g. Academy U13"
              className={inputClass}
              style={inputStyle}
            />
          ) : (
            <select
              id="team_category"
              name="category"
              defaultValue=""
              onChange={(e) => setCategory(e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">Not specified</option>
              {TEAM_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
              <option value={OTHER_TEAM_CATEGORY}>Other…</option>
            </select>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <SubmitButton label="Create team" pendingLabel="Creating…" />
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-4 py-2.5 text-sm font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function InvitePractitionerForm({
  clubId,
  teams,
  onDone,
}: {
  clubId: string;
  teams: Team[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(invitePractitioner, initialState);
  const [specialty, setSpecialty] = useState("");
  const [department, setDepartment] = useState("");

  function handleSpecialtyChange(value: string) {
    setSpecialty(value);
    const match = SPECIALTIES.find((s) => s.value === value);
    if (match) setDepartment(match.department);
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border p-4" style={{ borderColor: "var(--border)" }} noValidate>
      <input type="hidden" name="club_id" value={clubId} />
      <ErrorBanner error={state.error} />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="first_name" className={labelClass} style={{ color: "var(--text)" }}>
            First name
          </label>
          <input id="first_name" name="first_name" type="text" required className={inputClass} style={inputStyle} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="last_name" className={labelClass} style={{ color: "var(--text)" }}>
            Last name
          </label>
          <input id="last_name" name="last_name" type="text" required className={inputClass} style={inputStyle} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={labelClass} style={{ color: "var(--text)" }}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="practitioner@example.com"
          className={inputClass}
          style={inputStyle}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="specialty" className={labelClass} style={{ color: "var(--text)" }}>
            Specialty
          </label>
          {specialty === OTHER_SPECIALTY ? (
            <input
              id="specialty"
              name="specialty"
              type="text"
              required
              placeholder="e.g. Sports Psychologist"
              className={inputClass}
              style={inputStyle}
            />
          ) : (
            <select
              id="specialty"
              name="specialty"
              required
              value={specialty}
              onChange={(e) => handleSpecialtyChange(e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="" disabled>
                Select a specialty…
              </option>
              {SPECIALTIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
              <option value={OTHER_SPECIALTY}>Other…</option>
            </select>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="department" className={labelClass} style={{ color: "var(--text)" }}>
            Department
          </label>
          <select
            id="department"
            name="department"
            required
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className={inputClass}
            style={inputStyle}
          >
            <option value="" disabled>
              Select a department…
            </option>
            <option value="technical">Technical</option>
            <option value="medical">Medical</option>
          </select>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Auto-filled from specialty — override if needed.
          </p>
        </div>
      </div>

      {teams.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className={labelClass} style={{ color: "var(--text)" }}>
            Assign to team(s) — optional
          </legend>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {teams.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
                <input type="checkbox" name="team_ids" value={t.id} />
                {t.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex gap-2">
        <SubmitButton label="Invite practitioner" pendingLabel="Inviting…" />
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-4 py-2.5 text-sm font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function AssignTeamWidget({
  clubId,
  profileId,
  teams,
}: {
  clubId: string;
  profileId: string;
  teams: Team[];
}) {
  const [state, formAction] = useActionState(assignToTeam, initialState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium underline-offset-2 hover:underline"
        style={{ color: "var(--brand-blue)" }}
      >
        + Assign to team
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 flex items-center gap-2">
      <input type="hidden" name="club_id" value={clubId} />
      <input type="hidden" name="profile_id" value={profileId} />
      <select name="team_id" required defaultValue="" className={inputClass} style={{ ...inputStyle, padding: "0.4rem 0.6rem" }}>
        <option value="" disabled>
          Select a team…
        </option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
        style={{ backgroundImage: "var(--brand-gradient)" }}
      >
        Assign
      </button>
      {state.error && (
        <span className="text-xs" style={{ color: "var(--danger)" }}>
          {state.error}
        </span>
      )}
    </form>
  );
}

export default function TeamsStaffClient({
  clubId,
  teams,
  staff,
}: {
  clubId: string;
  teams: Team[];
  staff: StaffMember[];
}) {
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Teams
          </h2>
          {!showTeamForm && (
            <button
              type="button"
              onClick={() => setShowTeamForm(true)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90"
              style={{ backgroundImage: "var(--brand-gradient)" }}
            >
              + New Team
            </button>
          )}
        </div>

        {showTeamForm && <CreateTeamForm clubId={clubId} onDone={() => setShowTeamForm(false)} />}

        {teams.length === 0 ? (
          <div className="rounded-xl border p-8 text-center" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            <p style={{ color: "var(--text-muted)" }}>No teams yet.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                    Team
                  </th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                    Category
                  </th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }} />
                </tr>
              </thead>
              <tbody>
                {teams.map((t, i) => (
                  <tr key={t.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <td className="px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                      {t.name}
                    </td>
                    <td className="px-5 py-3" style={{ color: "var(--text)" }}>
                      {t.category ? CATEGORY_LABEL[t.category] ?? t.category : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/staff/${t.id}/comments`}
                        className="text-xs font-medium underline-offset-2 hover:underline"
                        style={{ color: "var(--brand-blue)" }}
                      >
                        Comments →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Staff
          </h2>
          {!showInviteForm && (
            <button
              type="button"
              onClick={() => setShowInviteForm(true)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90"
              style={{ backgroundImage: "var(--brand-gradient)" }}
            >
              + Invite Practitioner
            </button>
          )}
        </div>

        {showInviteForm && (
          <InvitePractitionerForm clubId={clubId} teams={teams} onDone={() => setShowInviteForm(false)} />
        )}

        {staff.length === 0 ? (
          <div className="rounded-xl border p-8 text-center" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            <p style={{ color: "var(--text-muted)" }}>No Club Practitioners yet.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                    Name
                  </th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                    Specialty
                  </th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                    Department
                  </th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                    Teams
                  </th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s, i) => (
                  <tr key={s.profileId} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <td className="px-5 py-3 align-top font-medium" style={{ color: "var(--text)" }}>
                      {s.firstName} {s.lastName}
                      <div className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>
                        {s.email}
                      </div>
                    </td>
                    <td className="px-5 py-3 align-top" style={{ color: "var(--text)" }}>
                      {SPECIALTIES.find((sp) => sp.value === s.specialty)?.label ?? s.specialty}
                    </td>
                    <td className="px-5 py-3 align-top" style={{ color: "var(--text)" }}>
                      {s.department ? DEPARTMENT_LABEL[s.department] : "—"}
                    </td>
                    <td className="px-5 py-3 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {s.assignedTeams.length > 0 ? (
                          s.assignedTeams.map((t) => (
                            <span
                              key={t.team_id}
                              className="rounded-full px-2.5 py-0.5 text-xs"
                              style={{ backgroundColor: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
                            >
                              {t.team_name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            No teams assigned
                          </span>
                        )}
                      </div>
                      {teams.length > 0 && (
                        <AssignTeamWidget clubId={clubId} profileId={s.profileId} teams={teams} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
