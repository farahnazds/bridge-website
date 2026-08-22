import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/auth";
import { getThreadsForCurrentProfile, getContactsForAthlete } from "@/lib/messaging";
import MessengerClient, { type ClientThread } from "@/components/MessengerClient";

export const metadata: Metadata = { title: "Messenger — Bridgetx" };

export default async function AthleteMessengerPage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const { athleteId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const [threads, contacts] = await Promise.all([
    getThreadsForCurrentProfile(profile.id),
    getContactsForAthlete(),
  ]);

  // Reply recipients are computed here rather than client-side because the
  // full participant set lives in message_recipients, which the client never
  // receives.
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
          Message one or more of your practitioners. They&apos;ll be notified in-app.
        </p>
      </div>

      <MessengerClient
        threads={clientThreads}
        contacts={contacts}
        revalidatePath={`/athlete/${athleteId}/messenger`}
      />
    </div>
  );
}
