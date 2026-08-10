"use client";

import { useActionState } from "react";
import { BTN_PRIMARY } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { saveMatrix, assignAdminToClub, removeAdminAssignment, type MatrixState, type AssignmentState } from "./actions";
import { ACCESS_LEVELS, PERMISSION_ROLES, PERMISSION_MODULES, NOT_SET } from "@/lib/constants";

export interface PermissionRow {
  role: string;
  module: string;
  access_level: string;
}
export interface AdminAssignment {
  id: string;
  adminName: string;
  adminEmail: string;
  clubName: string;
}
export interface Option {
  id: string;
  label: string;
}

const matrixInitial: MatrixState = { error: null, saved: false, changed: 0 };
const assignInitial: AssignmentState = { error: null, saved: false };
const inputClass =
  "rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-transparent focus:ring-2 focus:ring-[color:var(--brand-blue)]";
const inputStyle = { borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text)" };

const LEVEL_COLOR: Record<string, string> = {
  hide: "var(--danger)",
  view: "var(--warning)",
  edit: "var(--success)",
  [NOT_SET]: "var(--text-muted)",
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className={`w-fit ${BTN_PRIMARY}`}
      style={{ backgroundImage: "var(--brand-gradient)" }}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function PermissionMatrix({ rows, canWrite }: { rows: PermissionRow[]; canWrite: boolean }) {
  const [state, action] = useActionState(saveMatrix, matrixInitial);
  const current = new Map(rows.map((r) => [`${r.role}:${r.module}`, r.access_level]));

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="sticky left-0 px-5 py-3 font-medium"
                style={{ color: "var(--text-muted)", backgroundColor: "var(--surface)" }}>
                Module
              </th>
              {PERMISSION_ROLES.map((r) => (
                <th key={r.value} className="whitespace-nowrap px-4 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MODULES.map((m, i) => (
              <tr key={m.value} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                <td className="sticky left-0 whitespace-nowrap px-5 py-2.5 font-medium"
                  style={{ color: "var(--text)", backgroundColor: "var(--surface)" }}>
                  {m.label}
                </td>
                {PERMISSION_ROLES.map((r) => {
                  const value = current.get(`${r.value}:${m.value}`) ?? NOT_SET;
                  return (
                    <td key={r.value} className="px-4 py-2.5">
                      {canWrite ? (
                        <select
                          name={`perm:${r.value}:${m.value}`}
                          defaultValue={value}
                          aria-label={`${m.label} for ${r.label}`}
                          className="rounded-lg border px-2 py-1.5 text-xs outline-none focus:border-transparent focus:ring-2 focus:ring-[color:var(--brand-blue)]"
                          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)", color: LEVEL_COLOR[value] }}
                        >
                          <option value={NOT_SET}>Not set</option>
                          {ACCESS_LEVELS.map((l) => (
                            <option key={l.value} value={l.value}>{l.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs" style={{ color: LEVEL_COLOR[value] }}>
                          {value === NOT_SET ? "Not set" : ACCESS_LEVELS.find((l) => l.value === value)?.label ?? value}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{state.error}</p>
      )}
      {state.saved && !state.error && (
        <p className="text-sm" style={{ color: "var(--success)" }}>
          {state.changed === 0 ? "No changes to save." : `Saved — ${state.changed} cell${state.changed === 1 ? "" : "s"} updated.`}
        </p>
      )}
      {canWrite && <Submit label="Save matrix" />}
    </form>
  );
}

export function AdminAssignments({
  assignments, admins, clubs, canWrite,
}: {
  assignments: AdminAssignment[]; admins: Option[]; clubs: Option[]; canWrite: boolean;
}) {
  const [state, action] = useActionState(assignAdminToClub, assignInitial);

  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        <form action={action} className="flex flex-col gap-4 rounded-xl border p-5"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Assign an admin to a club
          </h3>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Admin</label>
              <select name="admin_profile_id" className={inputClass} style={inputStyle}>
                <option value="">Select an admin…</option>
                {admins.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Club</label>
              <select name="club_id" className={inputClass} style={inputStyle}>
                <option value="">Select a club…</option>
                {clubs.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <Submit label="Assign" />
          </div>
          {state.error && (
            <p role="alert" className="rounded-lg border px-4 py-3 text-sm"
              style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{state.error}</p>
          )}
        </form>
      )}

      {assignments.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          No admin assignments yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          {assignments.map((a, i) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-5"
              style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                  {a.adminName} → {a.clubName}
                </p>
                <p className="mt-0.5 text-xs"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {a.adminEmail}
                </p>
              </div>
              {canWrite && <RemoveAssignment id={a.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RemoveAssignment({ id }: { id: string }) {
  const [state, action] = useActionState(removeAdminAssignment, assignInitial);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-xs underline-offset-2 hover:underline" style={{ color: "var(--danger)" }}>
        Remove
      </button>
      {state.error && <span className="ml-2 text-xs" style={{ color: "var(--danger)" }}>{state.error}</span>}
    </form>
  );
}
