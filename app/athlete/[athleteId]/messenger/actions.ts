"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export interface ActionState {
  error: string | null;
}

// Shared by both messenger sides. `threadId` null starts a new thread;
// passing an existing one appends a reply.
//
// RLS does the real enforcement: "sender addresses own message" requires
// both that the caller authored the message AND that
// can_message_profile(recipient) holds, so an unrelated recipient is
// rejected at the database. The checks here are for clear errors, not
// security.
export async function sendMessage(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You need to be signed in." };

  const body = String(formData.get("body") ?? "").trim();
  const threadId = String(formData.get("thread_id") ?? "").trim() || null;
  const revalidate = String(formData.get("revalidate_path") ?? "").trim();
  const recipientIds = formData.getAll("recipient_ids").map(String).filter(Boolean);

  if (!body) return { error: "Write a message first." };
  if (recipientIds.length === 0) return { error: "Choose at least one recipient." };

  const supabase = await createClient();

  // thread_id has a default, but it's set explicitly for a new thread so the
  // id is known here without needing RETURNING on a second round-trip.
  const newThreadId = threadId ?? crypto.randomUUID();
  const messageId = crypto.randomUUID();

  const { error: msgError } = await supabase.from("messages").insert({
    id: messageId,
    sender_id: profile.id,
    thread_id: newThreadId,
    body,
  });
  if (msgError) {
    return { error: `Couldn't send the message: ${msgError.message}` };
  }

  const { error: recipientError } = await supabase
    .from("message_recipients")
    .insert(recipientIds.map((recipientId) => ({ message_id: messageId, recipient_id: recipientId })));
  if (recipientError) {
    // The message row exists but reached nobody — remove it rather than
    // leave an unaddressed orphan the sender would see in their own thread
    // list as if it had been delivered.
    await supabase.from("messages").delete().eq("id", messageId);
    return {
      error: `Couldn't deliver the message: ${recipientError.message}. You may not be able to message one of those recipients.`,
    };
  }

  // In-app notification, same shape as report sharing. RLS-scoped via
  // "message sender notifies recipients"
  // (database/migrations/013_messenger_policies.sql). Best-effort: a failure
  // here must not undo a message that was already delivered.
  const senderName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.email;
  const { error: notifError } = await supabase.from("notifications").insert(
    recipientIds.map((recipientId) => ({
      profile_id: recipientId,
      type: "message_received",
      title: `New message from ${senderName}`,
      body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
      related_id: messageId,
    }))
  );

  if (revalidate) revalidatePath(revalidate);
  if (notifError) {
    return { error: null };
  }
  return { error: null };
}

// Marks every message in a thread that is addressed to the caller as read.
// "recipient updates read status" scopes this to the caller's own rows.
export async function markThreadRead(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You need to be signed in." };

  const threadId = String(formData.get("thread_id") ?? "").trim();
  const revalidate = String(formData.get("revalidate_path") ?? "").trim();
  if (!threadId) return { error: "Missing thread." };

  const supabase = await createClient();
  const { data: msgs } = await supabase.from("messages").select("id").eq("thread_id", threadId);
  const ids = (msgs ?? []).map((m) => m.id as string);
  if (ids.length === 0) return { error: null };

  await supabase
    .from("message_recipients")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", profile.id)
    .is("read_at", null)
    .in("message_id", ids);

  if (revalidate) revalidatePath(revalidate);
  return { error: null };
}
