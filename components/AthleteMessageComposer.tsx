"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { sendMessage, type ActionState } from "@/app/athlete/[athleteId]/messenger/actions";
import { BTN_PRIMARY, BTN_TERTIARY, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";

// Compose-and-redirect: the Athlete Profile's Messenger quick-add.
//
// Deliberately NOT the Messenger page's NewThreadForm. That form's job is to
// choose recipients from a list and stay put; here the recipient is already
// decided by whose profile you are on, so a "Send to" fieldset containing one
// unchangeable name is chrome around a decision nobody is making. What is
// reused is the part that matters — `sendMessage`, with its RLS
// `can_message_profile` check, its orphan cleanup and its notification insert.
// The form markup is the thin part; the action is the thing that must not be
// reimplemented.
//
// After a successful send it navigates to the conversation on the real
// Messenger page rather than closing in place. That matches how the rest of the
// profile behaves — a quick action here, the full experience on the dedicated
// page — and it is the honest thing to do with a message: there is now a
// conversation, and replies happen where conversations live, not in a modal
// that has already closed.
//
// The action returns the thread id precisely so this can land on the right one
// (`?thread=<id>`), rather than dropping the practitioner at the top of a list
// to find what they just sent.

const initialState: ActionState = { error: null };

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={BTN_PRIMARY}
      style={{ backgroundImage: "var(--brand-gradient-action)" }}>
      {pending ? "Sending…" : "Send and open conversation"}
    </button>
  );
}

export default function AthleteMessageComposer({
  teamId,
  recipientProfileId,
  athleteName,
  onDone,
}: {
  teamId: string;
  /** The athlete's login profile. The caller only renders this when it exists —
   *  an un-activated athlete has nobody to address. */
  recipientProfileId: string;
  athleteName: string;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(sendMessage, initialState);
  const router = useRouter();
  // A ref, not state: this guards the redirect from firing twice while
  // navigation is in flight, and nothing renders differently because of it.
  // Holding it in state would mean a setState inside the effect body — a
  // cascading render, which react-hooks/set-state-in-effect rightly rejects.
  const navigated = useRef(false);

  useEffect(() => {
    if (navigated.current || !state.savedAt || !state.threadId) return;
    navigated.current = true;
    // push, not replace: Back should return to the profile the practitioner
    // was reading, which is where they came from.
    router.push(`/staff/${teamId}/messenger?thread=${state.threadId}`);
  }, [state.savedAt, state.threadId, router, teamId]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {/* The message is addressed by the profile, not by the practitioner. */}
      <input type="hidden" name="recipient_ids" value={recipientProfileId} />
      {/* Revalidate the messenger page, since that is where this is about to
          navigate — the new thread has to be in that render. */}
      <input type="hidden" name="revalidate_path" value={`/staff/${teamId}/messenger`} />

      {state.error && (
        <p role="alert" className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)", backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)" }}>
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="quick_message_body" className="text-sm font-medium" style={{ color: "var(--text)" }}>
          Message to {athleteName}
        </label>
        <textarea
          id="quick_message_body"
          name="body"
          rows={4}
          required
          autoFocus
          placeholder="Write your message…"
          className={INPUT}
          style={INPUT_STYLE}
        />
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Sending opens the conversation in Messenger, where you can keep replying.
        </p>
      </div>

      <div className="flex gap-2">
        <SendButton />
        <button type="button" onClick={onDone} className={BTN_TERTIARY} style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
