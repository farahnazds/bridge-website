import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getStaffTeamContext } from "@/lib/staffTeamContext";
import { getThreadsForCurrentProfile } from "@/lib/messaging";
import MessengerClient, { type ClientThread, type ClientContact } from "@/components/MessengerClient";

export const metadata: Metadata = { title: "Messenger — Bridgetx" };

type AthleteEmbed = {
  id: string;
  first_name: string;
  last_name: string;
  code: string;
  profile_id: string | null;
};

export default async function TeamMessengerPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  // Reuses the layout's cached context query — no extra round trip.
  const context = await getStaffTeamContext(teamId);
  if (!context) return null;
  const { profile } = context;

  const supabase = await createClient();

  // Athletes on this team who have a login profile. One who hasn't activated
  // yet has no profile_id and therefore cannot be a message recipient —
  // filtered out here so the picker never offers an address that would fail.
  const { data: rosterData } = await supabase
    .from("athlete_teams")
    .select("athlete_id, athletes(id, first_name, last_name, code, profile_id)")
    .eq("team_id", teamId);

  const contacts: ClientContact[] = (rosterData ?? [])
    .map((row) => row.athletes as unknown as AthleteEmbed | null)
    .filter((a): a is AthleteEmbed => a !== null && a.profile_id !== null)
    .sort((a, b) => a.last_name.localeCompare(b.last_name))
    .map((a) => ({
      id: a.profile_id as string,
      name: `${a.first_name} ${a.last_name}`,
      role: a.code,
    }));

  const threads = await getThreadsForCurrentProfile(profile.id);

  const clientThreads: ClientThread[] = threads.map((t) => {
    const participants = new Set<string>();
    for (const m of t.messages) {
      participants.add(m.senderId);
      for (const r of m.recipientIds) participants.add(r);
    }
    participants.delete(profile.id);
    return {
      threadId: t.threadId,
      lastAt: t.lastAt,
      participantNames: t.participantNames,
      unreadCount: t.unreadCount,
      replyRecipientIds: [...participants],
      messages: t.messages.map((m) => ({
        id: m.id,
        senderName: m.senderName,
        body: m.body,
        createdAt: m.createdAt,
        isMine: m.isMine,
      })),
    };
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Messenger
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Conversations with your athletes. Every message notifies the recipient in-app.
        </p>
      </div>

      <MessengerClient
        threads={clientThreads}
        contacts={contacts}
        revalidatePath={`/staff/${teamId}/messenger`}
      />
    </div>
  );
}
