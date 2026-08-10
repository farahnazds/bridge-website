"use client";

import { useActionState, useState } from "react";
import { BADGE, BTN_PRIMARY, BTN_TERTIARY, CARD, INPUT, INPUT_STYLE, NOTICE, PANEL } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { sendMessage, markThreadRead, type ActionState } from "@/app/athlete/[athleteId]/messenger/actions";

// Shared by the athlete and practitioner messenger pages — the surface is
// identical for both; only who appears in `contacts` differs (and a
// practitioner replying to an existing thread has no contact picker at all).
const initialState: ActionState = { error: null };


export interface ClientThread {
  threadId: string;
  lastAt: string;
  participantNames: string[];
  unreadCount: number;
  // Everyone in the thread except the viewer — computed server-side, where
  // the full recipient list is available.
  replyRecipientIds: string[];
  messages: {
    id: string;
    senderName: string;
    body: string;
    createdAt: string;
    isMine: boolean;
  }[];
}

export interface ClientContact {
  id: string;
  name: string;
  role: string;
}

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className={NOTICE}
      style={{
        borderColor: "var(--danger)",
        color: "var(--danger)",
        backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
      }}
    >
      {error}
    </p>
  );
}

function SendButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={BTN_PRIMARY}
      style={{ backgroundImage: "var(--brand-gradient)" }}
    >
      {pending ? "Sending…" : label}
    </button>
  );
}

function NewThreadForm({
  contacts,
  revalidatePath,
  onDone,
}: {
  contacts: ClientContact[];
  revalidatePath: string;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(sendMessage, initialState);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form
      action={formAction}
      className={`flex flex-col gap-4 ${PANEL} p-4`}
      style={{ borderColor: "var(--border)" }}
      noValidate
    >
      <input type="hidden" name="revalidate_path" value={revalidatePath} />
      <ErrorBanner error={state.error} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium" style={{ color: "var(--text)" }}>
          Send to
        </legend>
        {contacts.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No one available to message yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {contacts.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
                <input
                  type="checkbox"
                  name="recipient_ids"
                  value={c.id}
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
                {c.name}
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {c.role}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <textarea
        name="body"
        rows={3}
        required
        placeholder="Write your message…"
        className={INPUT}
        style={INPUT_STYLE}
      />

      <div className="flex gap-2">
        <SendButton label="Send" />
        <button
          type="button"
          onClick={onDone}
          className={BTN_TERTIARY}
          style={{ color: "var(--text-muted)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ReplyForm({
  threadId,
  recipientIds,
  revalidatePath,
}: {
  threadId: string;
  recipientIds: string[];
  revalidatePath: string;
}) {
  const [state, formAction] = useActionState(sendMessage, initialState);
  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="thread_id" value={threadId} />
      <input type="hidden" name="revalidate_path" value={revalidatePath} />
      {recipientIds.map((id) => (
        <input key={id} type="hidden" name="recipient_ids" value={id} />
      ))}
      <ErrorBanner error={state.error} />
      <textarea name="body" rows={2} required placeholder="Reply…" className={INPUT} style={INPUT_STYLE} />
      <div>
        <SendButton label="Reply" />
      </div>
    </form>
  );
}

function MarkReadButton({ threadId, revalidatePath }: { threadId: string; revalidatePath: string }) {
  const [, formAction] = useActionState(markThreadRead, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="thread_id" value={threadId} />
      <input type="hidden" name="revalidate_path" value={revalidatePath} />
      <button
        type="submit"
        className="text-xs font-medium underline-offset-2 hover:underline"
        style={{ color: "var(--brand-blue)" }}
      >
        Mark read
      </button>
    </form>
  );
}

function ThreadCard({ thread, revalidatePath }: { thread: ClientThread; revalidatePath: string }) {
  // Threads with something unread open by default — that's the reason you
  // came to this page.
  const [open, setOpen] = useState(thread.unreadCount > 0);
  const replyTo = thread.replyRecipientIds;

  return (
    <div
      className={`${CARD} p-5`}
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            {thread.participantNames.join(", ") || "Conversation"}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {thread.messages.length} message{thread.messages.length === 1 ? "" : "s"} · last{" "}
            {new Date(thread.lastAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {thread.unreadCount > 0 && (
            <span
              className={`${BADGE} text-white`}
              style={{ backgroundColor: "var(--brand-blue)" }}
            >
              {thread.unreadCount} new
            </span>
          )}
          {thread.unreadCount > 0 && (
            <MarkReadButton threadId={thread.threadId} revalidatePath={revalidatePath} />
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--brand-blue)" }}
          >
            {open ? "Hide" : "Open"}
          </button>
        </div>
      </div>

      {open && (
        <>
          <div className="mt-4 flex flex-col gap-3">
            {thread.messages.map((m) => (
              <div
                key={m.id}
                className={`${PANEL} p-3`}
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: m.isMine ? "var(--bg)" : "transparent",
                }}
              >
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {m.isMine ? "You" : m.senderName} ·{" "}
                  {new Date(m.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: "var(--text)" }}>
                  {m.body}
                </p>
              </div>
            ))}
          </div>
          {replyTo.length > 0 && (
            <ReplyForm threadId={thread.threadId} recipientIds={replyTo} revalidatePath={revalidatePath} />
          )}
        </>
      )}
    </div>
  );
}

export default function MessengerClient({
  threads,
  contacts,
  revalidatePath,
  canStartThread = true,
}: {
  threads: ClientThread[];
  contacts: ClientContact[];
  revalidatePath: string;
  canStartThread?: boolean;
}) {
  const [composing, setComposing] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      {canStartThread && (
        <div className="flex items-center justify-between">
          <h2
            className="text-base font-semibold"
            style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
          >
            Conversations
          </h2>
          {!composing && (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className={BTN_PRIMARY}
              style={{ backgroundImage: "var(--brand-gradient)" }}
            >
              + New message
            </button>
          )}
        </div>
      )}

      {composing && (
        <NewThreadForm
          contacts={contacts}
          revalidatePath={revalidatePath}
          onDone={() => setComposing(false)}
        />
      )}

      {threads.length === 0 ? (
        <div
          className={`${CARD} p-10 text-center`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p style={{ color: "var(--text-muted)" }}>No messages yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {threads.map((t) => (
            <ThreadCard key={t.threadId} thread={t} revalidatePath={revalidatePath} />
          ))}
        </div>
      )}
    </div>
  );
}
