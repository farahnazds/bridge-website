import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import LeadsClient, { type Lead } from "./LeadsClient";
import { NOTICE } from "@/lib/ui";

export const metadata: Metadata = { title: "Leads & CRM — Bridgetx" };

// Leads & CRM (docs/03-site-map.md, Super Admin).
//
// `leads` carries "super admin full access" and a "public insert" policy for
// the marketing contact form — and no admin policy. So an Admin loading this
// page legitimately reads zero rows; the page says that plainly rather than
// showing an empty list that looks like "no leads exist".

export default async function LeadsPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const canWrite = profile?.role === "super_admin";

  const { data, error } = await supabase
    .from("leads")
    .select("id, name, club_name, email, phone, status, notes, meeting_booked, contract_sent, contract_signed, created_at")
    .order("created_at", { ascending: false });

  const leads = (data ?? []) as Lead[];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Leads &amp; CRM
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Inbound enquiries and where each one has reached in the pipeline.
        </p>
      </div>

      {error && (
        <p role="status" className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          Couldn&apos;t load leads: {error.message}
        </p>
      )}

      {!canWrite && (
        <p className={NOTICE}
          style={{ borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "var(--bg)" }}>
          Leads are managed by Super Admin. You can see this page, but the records themselves are not
          shared with the Admin role.
        </p>
      )}

      {!error && <LeadsClient leads={leads} canWrite={canWrite} />}
    </div>
  );
}
