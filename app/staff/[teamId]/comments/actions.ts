"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export interface ActionState {
  error: string | null;
}

// RLS ("linked staff creates comments") independently re-verifies the
// author actually has legitimate access to the target athlete/team — this
// role check is just a fast, clear failure path, not the real boundary.
export async function createComment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "club_practitioner" && profile.role !== "club_manager")) {
    return { error: "You don't have permission to do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const target = String(formData.get("target") ?? "").trim(); // "team" or an athlete id
  const commentType = String(formData.get("comment_type") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const reflectInAi = formData.get("reflect_in_ai") === "on";

  if (!teamId || !target || !body) {
    return { error: "A target and comment body are required." };
  }
  if (commentType !== "private_note" && commentType !== "official_comment") {
    return { error: "Invalid comment type." };
  }

  const supabase = await createClient();
  const insertData: Record<string, unknown> = {
    author_id: profile.id,
    comment_type: commentType,
    body,
    // reflect_in_ai only ever means something for an official comment —
    // Flow 8 step 2: marked optionally "at the moment of posting".
    reflect_in_ai: commentType === "official_comment" ? reflectInAi : false,
  };
  if (target === "team") {
    insertData.team_id = teamId;
  } else {
    insertData.athlete_id = target;
  }

  const { error } = await supabase.from("comments").insert(insertData);
  if (error) {
    return { error: `Couldn't post the comment: ${error.message}` };
  }

  revalidatePath(`/staff/${teamId}/comments`);
  return { error: null };
}

// "author deletes own comment" RLS scopes this to the caller's own rows —
// a DELETE the policy denies simply matches zero rows (no thrown error),
// so an empty return from .select() after the delete is how we detect
// that, same zero-rows-returned pattern used for update-window checks
// elsewhere in this app.
export async function deleteComment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You don't have permission to do this." };

  const teamId = String(formData.get("team_id") ?? "").trim();
  const commentId = String(formData.get("comment_id") ?? "").trim();
  if (!teamId || !commentId) return { error: "Missing comment." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("comments").delete().eq("id", commentId).select("id");
  if (error) {
    return { error: `Couldn't delete the comment: ${error.message}` };
  }
  if (!data || data.length === 0) {
    return { error: "You can only delete your own comments." };
  }

  revalidatePath(`/staff/${teamId}/comments`);
  return { error: null };
}

// Flow 8, step 4: Club Manager can independently toggle a comment's
// AI-reflection off — a lighter moderation action than deletion, the
// comment stays visible either way. One-directional per the docs (no
// "toggle back on" — nothing in Flow 8 describes re-enabling it).
export async function toggleReflection(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "club_manager") {
    return { error: "Only a Club Manager can do this." };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const commentId = String(formData.get("comment_id") ?? "").trim();
  if (!teamId || !commentId) return { error: "Missing comment." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .update({ reflect_in_ai: false, ai_reflection_disabled_by: profile.id })
    .eq("id", commentId)
    .select("id");
  if (error) {
    return { error: `Couldn't update the comment: ${error.message}` };
  }
  if (!data || data.length === 0) {
    return { error: "You don't have permission to moderate this comment." };
  }

  revalidatePath(`/staff/${teamId}/comments`);
  return { error: null };
}
