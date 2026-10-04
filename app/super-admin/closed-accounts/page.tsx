import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CARD, NOTICE, NOTICE_EMPTY } from "@/lib/ui";
import RestoreForm from "./RestoreForm";

export const metadata: Metadata = { title: "Closed Accounts — Super Admin — Bridgetx" };

// Athletes who deleted their own account (migration 069), newest first.
//
// SUPER ADMIN ONLY — the layout redirects everyone else, and the data is
// protected independently: athlete_deletion_vault has a super-admin-only RLS
// policy, so for any other role the vault query below returns nothing even if
// this page were somehow reached. Read under the viewer's own session (no
// service role) for exactly that reason.
//
// The "before" name and email come from the vault. Nothing here changes data
// except Restore, which is the one action that reverses the athlete's choice.

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

export default async function ClosedAccountsPage() {
  const supabase = await createClient();

  const { data: closures, error } = await supabase
    .from("athlete_account_closures")
    .select("id, athlete_id, deleted_at")
    .eq("status", "deleted")
    .order("deleted_at", { ascending: false });

  const ids = (closures ?? []).map((c) => c.athlete_id);
  const [{ data: vault }, { data: athletes }] = ids.length
    ? await Promise.all([
        supabase
          .from("athlete_deletion_vault")
          .select("athlete_id, athlete_first_name, athlete_last_name, email")
          .in("athlete_id", ids),
        supabase.from("athletes").select("id, code, club_id, clubs(name)").in("id", ids),
      ])
    : [{ data: [] }, { data: [] }];

  const vaultBy = new Map((vault ?? []).map((v) => [v.athlete_id, v]));
  const athleteBy = new Map(
    ((athletes ?? []) as unknown as { id: string; code: string; club_id: string | null; clubs: { name: string } | null }[]).map((a) => [a.id, a]),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Closed Accounts
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Athletes who deleted their own account. Their login is gone and their name and email are anonymized everywhere; the
          original details are kept here, visible only to Super Admin, so an account can be restored. Their history is untouched.
        </p>
      </div>

      {error && (
        <p role="status" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          Couldn&apos;t load closed accounts: {error.message}
        </p>
      )}

      {!error && (closures ?? []).length === 0 && (
        <p className={NOTICE_EMPTY} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          No athlete has deleted their account.
        </p>
      )}

      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {(closures ?? []).map((c) => {
          const v = vaultBy.get(c.athlete_id);
          const a = athleteBy.get(c.athlete_id);
          const name = v ? `${v.athlete_first_name ?? ""} ${v.athlete_last_name ?? ""}`.trim() : "Unavailable";
          return (
            <li
              key={c.id}
              className={`flex flex-col gap-4 ${CARD} p-5`}
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <Field label="Name before deletion" value={name} />
                <Field label="Email before deletion" value={v?.email ?? "—"} />
                <Field label="Club" value={a?.clubs?.name ?? "No club (guided / independent)"} />
                <Field label="Deleted" value={c.deleted_at ? fmt(c.deleted_at) : "—"} />
              </div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Athlete code {a?.code ?? "—"}.{" "}
                {a?.club_id && (
                  <Link href={`/club/${a.club_id}/athletes/${c.athlete_id}`} className="underline-offset-2 hover:underline" style={{ color: "var(--brand-blue)" }}>
                    View their preserved record
                  </Link>
                )}
              </p>
              {v ? (
                <RestoreForm
                  athleteId={c.athlete_id}
                  originalFirst={v.athlete_first_name ?? ""}
                  originalLast={v.athlete_last_name ?? ""}
                  originalEmail={v.email}
                />
              ) : (
                <p className={NOTICE} style={{ borderColor: "var(--warning)", color: "var(--text-muted)" }}>
                  No retained copy exists for this account, so it can&rsquo;t be restored automatically.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="break-words text-sm" style={{ color: "var(--text)" }}>{value}</p>
    </div>
  );
}
