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

// The people an athlete may start a conversation with — read from the
// athlete_message_contacts view (migration 051), which IS the three athlete
// branches of can_message_profile() as a column-scoped list, so the UI can
// only ever offer a recipient the insert policy ("sender addresses own
// message") will accept.
//
// Until 2026-08-22 this walked athlete_teams -> staff_team_assignments ->
// profiles (+ club_staff managers) under the athlete's own RLS. None of those
// staffing tables has an athlete read policy, so the list was always EMPTY for
// a club athlete: they could reply in a thread a practitioner started, but
// never start one. Confirmed with a test-athlete session before the fix.
//
// The view filters to the CALLER (current_profile_id()), so athleteId is not
// a filter here — it is kept in the signature because both messenger pages
// pass it and the independent tree may one day need it.
export async function getContactsForAthlete(_athleteId: string): Promise<Contact[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("athlete_message_contacts")
    .select("id, first_name, last_name, specialty, role");

  const contacts = new Map<string, Contact>();
  for (const p of data ?? []) {
    if (!p.id || contacts.has(p.id)) continue;
    const isManager = p.role === "club_manager";
    contacts.set(p.id, {
      id: p.id,
      name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || (isManager ? "Club Manager" : "Practitioner"),
      role: isManager ? "Club Manager" : p.specialty ?? "Practitioner",
    });
  }
  return [...contacts.values()].sort((a, b) => a.name.localeCompare(b.name));
}
