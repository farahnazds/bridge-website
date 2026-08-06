import { createClient } from "@/lib/supabase/server";

// Shared messenger reads for both sides (athlete and practitioner). Kept in
// lib/ per CLAUDE.md rather than duplicated across the two pages — the
// thread-assembly logic is identical for both roles, only the "who can I
// start a conversation with" list differs.

export interface ThreadMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  isMine: boolean;
  recipientIds: string[];
}

export interface Thread {
  threadId: string;
  messages: ThreadMessage[];
  lastAt: string;
  participantNames: string[];
  unreadCount: number;
}

// Every message the caller sent or received. RLS ("sender reads own
// messages" / "recipient reads message via join") already scopes this — the
// caller cannot see a thread they aren't part of, so no extra filter is
// applied or needed here.
export async function getThreadsForCurrentProfile(profileId: string): Promise<Thread[]> {
  const supabase = await createClient();

  const { data: messageRows } = await supabase
    .from("messages")
    .select("id, thread_id, sender_id, body, created_at")
    .order("created_at", { ascending: true });

  const messages = messageRows ?? [];
  if (messages.length === 0) return [];

  const messageIds = messages.map((m) => m.id as string);
  const { data: recipientRows } = await supabase
    .from("message_recipients")
    .select("message_id, recipient_id, read_at")
    .in("message_id", messageIds);

  const recipientsByMessage = new Map<string, string[]>();
  const unreadByMessage = new Map<string, boolean>();
  for (const r of recipientRows ?? []) {
    const list = recipientsByMessage.get(r.message_id as string) ?? [];
    list.push(r.recipient_id as string);
    recipientsByMessage.set(r.message_id as string, list);
    if (r.recipient_id === profileId && r.read_at === null) {
      unreadByMessage.set(r.message_id as string, true);
    }
  }

  const personIds = [
    ...new Set([
      ...messages.map((m) => m.sender_id as string),
      ...(recipientRows ?? []).map((r) => r.recipient_id as string),
    ]),
  ];
  const { data: people } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", personIds);
  const nameById = new Map(
    (people ?? []).map((p) => [p.id as string, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—"])
  );

  const byThread = new Map<string, ThreadMessage[]>();
  for (const m of messages) {
    const tm: ThreadMessage = {
      id: m.id as string,
      threadId: m.thread_id as string,
      senderId: m.sender_id as string,
      senderName: nameById.get(m.sender_id as string) ?? "—",
      body: m.body as string,
      createdAt: m.created_at as string,
      isMine: m.sender_id === profileId,
      recipientIds: recipientsByMessage.get(m.id as string) ?? [],
    };
    const list = byThread.get(tm.threadId) ?? [];
    list.push(tm);
    byThread.set(tm.threadId, list);
  }

  const threads: Thread[] = [...byThread.entries()].map(([threadId, msgs]) => {
    const participants = new Set<string>();
    for (const m of msgs) {
      participants.add(m.senderId);
      for (const r of m.recipientIds) participants.add(r);
    }
    participants.delete(profileId);
    return {
      threadId,
      messages: msgs,
      lastAt: msgs[msgs.length - 1].createdAt,
      participantNames: [...participants].map((id) => nameById.get(id) ?? "—"),
      unreadCount: msgs.filter((m) => unreadByMessage.get(m.id)).length,
    };
  });

  return threads.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
}

export interface Contact {
  id: string;
  name: string;
  role: string;
}

// The practitioners an athlete may start a conversation with. Mirrors the
// first three branches of can_message_profile() in
// database/migrations/013_messenger_policies.sql — the RLS policy is the
// real boundary; this exists so the UI only offers valid choices instead of
// letting someone pick a recipient the insert would then reject.
export async function getContactsForAthlete(athleteId: string): Promise<Contact[]> {
  const supabase = await createClient();

  const { data: teamRows } = await supabase
    .from("athlete_teams")
    .select("team_id")
    .eq("athlete_id", athleteId);
  const teamIds = (teamRows ?? []).map((t) => t.team_id as string);

  const contacts = new Map<string, Contact>();

  if (teamIds.length > 0) {
    const { data: assigned } = await supabase
      .from("staff_team_assignments")
      .select("staff_profile_id, profiles(id, first_name, last_name, specialty)")
      .in("team_id", teamIds);
    for (const row of assigned ?? []) {
      const p = row.profiles as unknown as
        | { id: string; first_name: string | null; last_name: string | null; specialty: string | null }
        | null;
      if (p) {
        contacts.set(p.id, {
          id: p.id,
          name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Practitioner",
          role: p.specialty ?? "Practitioner",
        });
      }
    }
  }

  const { data: athlete } = await supabase.from("athletes").select("club_id").eq("id", athleteId).single();
  if (athlete?.club_id) {
    const { data: managers } = await supabase
      .from("club_staff")
      .select("profile_id, profiles(id, first_name, last_name)")
      .eq("club_id", athlete.club_id)
      .eq("staff_role", "club_manager");
    for (const row of managers ?? []) {
      const p = row.profiles as unknown as
        | { id: string; first_name: string | null; last_name: string | null }
        | null;
      if (p && !contacts.has(p.id)) {
        contacts.set(p.id, {
          id: p.id,
          name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Club Manager",
          role: "Club Manager",
        });
      }
    }
  }

  return [...contacts.values()].sort((a, b) => a.name.localeCompare(b.name));
}
