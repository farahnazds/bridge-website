"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth";
import { getBaseUrl } from "@/lib/site";
import { parseCsvText } from "@/lib/csv";
import { validateAthleteRows, type ParsedAthleteRow } from "./csvValidation";

// ---- Phase 1: parse + validate, nothing saved yet (Flow 6, steps 2-4) ----
export interface PreviewState {
  error: string | null;
  rows: ParsedAthleteRow[];
}

export async function previewAthleteCsv(_prevState: PreviewState, formData: FormData): Promise<PreviewState> {
  if (!(await hasRole("club_manager"))) {
    return { error: "You don't have permission to do this.", rows: [] };
  }

  const clubId = String(formData.get("club_id") ?? "").trim();
  const file = formData.get("csv_file") as File | null;
  if (!clubId || !file || file.size === 0) {
    return { error: "Choose a CSV file first.", rows: [] };
  }

  const text = await file.text();
  const { rows: rawRows, error: parseError } = parseCsvText(text);
  if (parseError) {
    return { error: `Couldn't parse the CSV: ${parseError}`, rows: [] };
  }
  if (rawRows.length === 0) {
    return { error: "That file has no data rows.", rows: [] };
  }

  const supabase = await createClient();
  const [{ data: teams }, { data: existingAthletes }] = await Promise.all([
    supabase.from("teams").select("id, name").eq("club_id", clubId),
    supabase.from("athletes").select("code, first_name, last_name").eq("club_id", clubId),
  ]);

  const existingCodes = new Map(
    (existingAthletes ?? []).map((a) => [a.code.toLowerCase(), `${a.first_name} ${a.last_name}`])
  );

  const rows = validateAthleteRows(rawRows, teams ?? [], existingCodes);
  return { error: null, rows };
}

// ---- Phase 2: confirm — nothing above this point wrote anything ----
export interface ImportResultRow {
  rowNumber: number;
  name: string;
  status: "created" | "failed";
  message: string | null;
}
export interface ConfirmState {
  error: string | null;
  results: ImportResultRow[] | null;
}

export async function confirmAthleteImport(_prevState: ConfirmState, formData: FormData): Promise<ConfirmState> {
  if (!(await hasRole("club_manager"))) {
    return { error: "You don't have permission to do this.", results: null };
  }

  const clubId = String(formData.get("club_id") ?? "").trim();
  const rowsJson = String(formData.get("rows_json") ?? "").trim();
  if (!clubId || !rowsJson) {
    return { error: "Nothing to import.", results: null };
  }

  let submittedRows: ParsedAthleteRow[];
  try {
    submittedRows = JSON.parse(rowsJson);
  } catch {
    return { error: "Couldn't read the import data — try previewing again.", results: null };
  }
  if (!Array.isArray(submittedRows) || submittedRows.length === 0) {
    return { error: "No valid rows to import.", results: null };
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();
  const baseUrl = await getBaseUrl();

  // Carried into each invite's user_metadata so the Supabase invite email
  // template can name the club ({{ .Data.club_name }}).
  const { data: clubRow } = await supabase.from("clubs").select("name").eq("id", clubId).maybeSingle();
  const clubName = (clubRow?.name as string | undefined) ?? "";

  // Re-validate from scratch server-side — never trust the client's "new"
  // labels, and time has passed since preview so teams/codes may have
  // changed. Each row's own code is passed through as-is (not blank) so
  // revalidation checks freshness of the EXACT code the user already saw
  // in preview, rather than silently generating a different one now.
  const [{ data: teams }, { data: existingAthletes }] = await Promise.all([
    supabase.from("teams").select("id, name").eq("club_id", clubId),
    supabase.from("athletes").select("code, first_name, last_name").eq("club_id", clubId),
  ]);
  const existingCodes = new Map(
    (existingAthletes ?? []).map((a) => [a.code.toLowerCase(), `${a.first_name} ${a.last_name}`])
  );
  const rawRowsForRevalidation = submittedRows.map((r) => ({
    first_name: r.firstName,
    last_name: r.lastName,
    email: r.email,
    code: r.code,
    team: r.teamName,
    sport: r.sport,
    position: r.position ?? "",
    dob: r.dob ?? "",
    gender: r.gender ?? "",
    tier: r.tier ?? "",
    diet_preference: r.dietPreference,
  }));
  const revalidated = validateAthleteRows(rawRowsForRevalidation, teams ?? [], existingCodes);

  const results: ImportResultRow[] = [];
  for (const row of revalidated) {
    const name = `${row.firstName} ${row.lastName}`.trim() || `Row ${row.rowNumber}`;

    if (row.status !== "new") {
      results.push({
        rowNumber: row.rowNumber,
        name,
        status: "failed",
        message: row.message ?? "No longer valid — re-run the preview.",
      });
      continue;
    }

    // Mirrors app/club/[clubId]/athletes/new/actions.ts's registerAthlete()
    // exactly: pre-generated profile id, no .select() on the profile insert
    // (RETURNING would be governed by a SELECT policy the fresh row can't
    // satisfy yet — see that file's comment), admin client only for
    // inviteUserByEmail (the one operation that always needs service-role
    // regardless of RLS).
    const { data: athlete, error: athleteError } = await supabase
      .from("athletes")
      .insert({
        club_id: clubId,
        first_name: row.firstName,
        last_name: row.lastName,
        code: row.code,
        sport: row.sport,
        position: row.position,
        tier: row.tier,
        dob: row.dob,
        gender: row.gender,
        diet_preference: row.dietPreference,
      })
      .select("id")
      .single();
    if (athleteError || !athlete) {
      const message =
        athleteError?.code === "23505"
          ? "That athlete code was taken by someone else during this import — re-run the preview."
          : athleteError?.message ?? "unknown error";
      results.push({ rowNumber: row.rowNumber, name, status: "failed", message });
      continue;
    }

    const { error: teamError } = await supabase
      .from("athlete_teams")
      .insert({ athlete_id: athlete.id, team_id: row.teamId! });
    if (teamError) {
      results.push({
        rowNumber: row.rowNumber,
        name,
        status: "failed",
        message: `Created, but team assignment failed: ${teamError.message}`,
      });
      continue;
    }

    const athleteProfileId = crypto.randomUUID();
    const { error: profileError } = await supabase.from("profiles").insert({
      id: athleteProfileId,
      role: "athlete",
      first_name: row.firstName,
      last_name: row.lastName,
      email: row.email,
    });
    if (profileError) {
      results.push({
        rowNumber: row.rowNumber,
        name,
        status: "failed",
        message: `Created, but login profile failed: ${profileError.message}. The email may already be registered.`,
      });
      continue;
    }

    await supabase.from("athletes").update({ profile_id: athleteProfileId }).eq("id", athlete.id);

    const { data: invite, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(row.email, {
      data: { first_name: row.firstName, last_name: row.lastName, club_name: clubName },
      redirectTo: `${baseUrl}/athlete/activate`,
    });
    if (inviteError || !invite.user) {
      results.push({
        rowNumber: row.rowNumber,
        name,
        status: "created",
        message: `Invite email failed to send: ${inviteError?.message ?? "unknown error"}. You'll need to resend it separately.`,
      });
      continue;
    }

    await supabase.from("profiles").update({ user_id: invite.user.id }).eq("id", athleteProfileId);
    results.push({ rowNumber: row.rowNumber, name, status: "created", message: null });
  }

  revalidatePath(`/club/${clubId}/athletes`);
  return { error: null, results };
}
