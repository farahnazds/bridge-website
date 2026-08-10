import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { getAssignedClubs, getScopeNoun } from "@/lib/adminScope";
import { CARD, NOTICE, NOTICE_EMPTY } from "@/lib/ui";
import {
  PermissionMatrix, AdminAssignments,
  type PermissionRow, type AdminAssignment, type Option,
} from "./MatrixClient";

export const metadata: Metadata = { title: "Staff & Permissions — Admin — Bridgetx" };

// docs/03-site-map.md, Super Admin: "Staff & Permissions — ceiling-level
// matrix, admin↔club assignments".
//
// IMPORTANT, and stated on the page itself rather than only here: the ceiling
// matrix is STORED but not yet ENFORCED. Nothing in the app reads
// `role_permissions` — access today comes from RLS plus the per-page role
// checks. Wiring the matrix into live access control is a platform-wide change
// with a real lockout failure mode (the Super Admin lockout fixed earlier came
// from exactly this class of app-layer gating), so it is deliberately left as a
// separate decision rather than switched on silently underneath existing users.

export default async function AdminStaffPermissionsPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const canWrite = profile?.role === "super_admin";

  const [clubs, scopeNoun] = await Promise.all([getAssignedClubs(), getScopeNoun()]);
  const clubIds = clubs.map((c) => c.id);
  const clubNameById = new Map(clubs.map((c) => [c.id, c.name]));

  const [permsRes, staffRes, adminsRes, assignmentsRes] = await Promise.all([
    supabase.from("role_permissions").select("role, module, access_level"),
    clubIds.length
      ? supabase
          .from("club_staff")
          .select("id, club_id, staff_role, profiles!profile_id(first_name, last_name, email, specialty, department)")
          .in("club_id", clubIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("profiles").select("id, first_name, last_name, email").eq("role", "admin").order("last_name"),
    supabase
      .from("admin_club_assignments")
      .select("id, club_id, admin_profile_id, profiles!admin_profile_id(first_name, last_name, email)")
      .not("club_id", "is", null),
  ]);

  const perms = (permsRes.data ?? []) as PermissionRow[];

  type StaffRow = {
    id: string;
    club_id: string;
    staff_role: string;
    profiles: { first_name: string | null; last_name: string | null; email: string; specialty: string | null; department: string | null } | null;
  };
  const staff = (staffRes.data ?? []) as unknown as StaffRow[];

  type AdminRow = { id: string; first_name: string | null; last_name: string | null; email: string };
  const admins = (adminsRes.data ?? []) as AdminRow[];

  type AssignmentRow = {
    id: string;
    club_id: string;
    admin_profile_id: string;
    profiles: { first_name: string | null; last_name: string | null; email: string } | null;
  };
  const assignmentRows = (assignmentsRes.data ?? []) as unknown as AssignmentRow[];

  const fullName = (p: { first_name: string | null; last_name: string | null } | null) =>
    `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();

  const assignments: AdminAssignment[] = assignmentRows
    .filter((a) => clubNameById.has(a.club_id))
    .map((a) => ({
      id: a.id,
      adminName: fullName(a.profiles) || "—",
      adminEmail: a.profiles?.email ?? "—",
      clubName: clubNameById.get(a.club_id) ?? "—",
    }))
    .sort((a, b) => a.adminName.localeCompare(b.adminName));

  const adminOptions: Option[] = admins.map((a) => ({
    id: a.id,
    label: `${fullName(a) || a.email}`,
  }));
  const clubOptions: Option[] = clubs.map((c) => ({ id: c.id, label: c.name }));

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Staff &amp; Permissions
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Who works at {scopeNoun}, which admins cover which clubs, and the ceiling each role can be granted up to.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Staff
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Club Managers and Practitioners registered across {scopeNoun}.
          </p>
        </div>
        {staff.length === 0 ? (
          <p className={NOTICE_EMPTY}
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            No staff registered in {scopeNoun}.
          </p>
        ) : (
          <div className={`overflow-x-auto ${CARD}`}
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Name</th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Club</th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Role</th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Department</th>
                  <th className="px-5 py-3 font-medium" style={{ color: "var(--text-muted)" }}>Email</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s, i) => (
                  <tr key={s.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <td className="px-5 py-3 font-medium" style={{ color: "var(--text)" }}>
                      {fullName(s.profiles) || "—"}
                    </td>
                    <td className="px-5 py-3" style={{ color: "var(--text-muted)" }}>
                      {clubNameById.get(s.club_id) ?? "—"}
                    </td>
                    <td className="px-5 py-3" style={{ color: "var(--text)" }}>
                      {s.staff_role === "club_manager" ? "Club Manager" : s.profiles?.specialty ?? "Practitioner"}
                    </td>
                    <td className="px-5 py-3 capitalize" style={{ color: "var(--text-muted)" }}>
                      {s.profiles?.department ?? "—"}
                    </td>
                    <td className="px-5 py-3"
                      style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: ".8rem" }}>
                      {s.profiles?.email ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Admin ↔ club assignments
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            An Admin sees exactly the clubs listed here — this is their entire data scope, not a display filter.
          </p>
        </div>
        {!canWrite && (
          <p className={NOTICE}
            style={{ borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "var(--bg)" }}>
            Assignments are set by Super Admin.
          </p>
        )}
        <AdminAssignments assignments={assignments} admins={adminOptions} clubs={clubOptions} canWrite={canWrite} />
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Permission ceiling
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            The maximum a role may be granted per module. &quot;Not set&quot; means no ceiling has been declared,
            which is different from a declared &quot;Hide&quot;.
          </p>
        </div>

        <p className={NOTICE}
          style={{ borderColor: "var(--warning)", color: "var(--text)", backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)" }}>
          <strong>Stored, not yet enforced.</strong> Nothing in the app reads this matrix today — access is
          currently decided by database row-level security and per-page role checks. Changing a cell records
          the intended ceiling; it does not yet change what anyone can reach. Enforcing it platform-wide is a
          separate change, deliberately not switched on silently.
        </p>

        {permsRes.error && (
          <p role="status" className={NOTICE}
            style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
            Couldn&apos;t load the matrix: {permsRes.error.message}
          </p>
        )}

        {!permsRes.error && <PermissionMatrix rows={perms} canWrite={canWrite} />}
      </section>
    </div>
  );
}
