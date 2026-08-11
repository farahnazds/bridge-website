"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export interface NameState {
  error: string | null;
  saved: boolean;
}

const MAX_NAME = 80;

// Self-service rename, and deliberately nothing else.
//
// This is the FIRST surface in the product where someone writes to their own
// `profiles` row, so the column list matters more than usual. The update sends
// first_name and last_name and no other column — role, email and user_id are
// never read from the form, so no request shape can carry them.
//
// That is not belt-and-braces, it is currently the ONLY guard. The RLS policy
// behind this ("update own profile basics", database/schema.sql) is written as
// `for update using (user_id = auth.uid())` with no `with check` clause, and
// Postgres reuses USING as the check when one is omitted. That constrains
// WHICH ROW you may update, not WHICH COLUMNS — so at the database level the
// policy also permits a caller to rewrite their own `role`. Nothing in this
// app does that, and this action cannot, but the gap is real and wants a
// migration adding a WITH CHECK that pins role/email/user_id. Flagged rather
// than fixed here because changing the security model is a deliberate call,
// not a side effect of shipping an account page.
export async function updateMyName(_prev: NameState, formData: FormData): Promise<NameState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You're not signed in.", saved: false };

  // docs/02-roles-and-permissions.md, Club Athlete: "Zero self-editable
  // fields". An athlete's name is held on `athletes` by their club because it
  // appears on official reports; letting them rename their `profiles` row
  // would create a second name that nothing else reads. The UI does not render
  // this form for them — this is the same rule stated where it is enforced.
  if (profile.role === "athlete") {
    return { error: "Your name is maintained by your club. Message your practitioner to change it.", saved: false };
  }

  const first = String(formData.get("first_name") ?? "").trim();
  const last = String(formData.get("last_name") ?? "").trim();

  if (!first || !last) return { error: "First and last name are both required.", saved: false };
  if (first.length > MAX_NAME || last.length > MAX_NAME) {
    return { error: `Names must be ${MAX_NAME} characters or fewer.`, saved: false };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ first_name: first, last_name: last })
    .eq("id", profile.id)
    .select("id");

  if (error) return { error: `Couldn't save your name: ${error.message}`, saved: false };
  // Zero rows means RLS refused the update rather than erroring — the same
  // detection the data-entry actions use for the 7-day edit window.
  if (!data || data.length === 0) {
    return { error: "Couldn't save your name — your account no longer has permission to.", saved: false };
  }

  // The name is rendered in the dashboard header on every route, so the whole
  // tree is revalidated rather than just this page.
  revalidatePath("/", "layout");
  return { error: null, saved: true };
}
