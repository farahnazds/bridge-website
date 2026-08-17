"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { BTN_PRIMARY_FULL, CARD, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";
import { inviteClubManager, removeClubManager, type ManagerActionState } from "./actions";

const initialState: ManagerActionState = { error: null };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={BTN_PRIMARY_FULL}
      style={{ backgroundImage: "var(--brand-gradient-action)" }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function InviteManagerForm({ clubId }: { clubId: string }) {
  const [state, formAction] = useActionState(inviteClubManager, initialState);
  const [sent, setSent] = useState(false);

  // useActionState keeps the last result; a null error after a submit means
  // the invite went out. Tracking "submitted at least once" client-side keeps
  // the success note from showing on first render.
  return (
    <form
      action={(fd) => {
        setSent(true);
        return formAction(fd);
      }}
      className={`${CARD} flex flex-col gap-4 p-5`}
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <div>
        <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          Invite Club Manager
        </h3>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          Adds a manager to this club and emails them an activation invite. To
          replace a manager, invite the new one first, then remove the old one.
        </p>
      </div>

      {state.error && (
        <p
          role="alert"
          className={NOTICE}
          style={{
            borderColor: "var(--danger)",
            color: "var(--danger)",
            backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
          }}
        >
          {state.error}
        </p>
      )}
      {sent && !state.error && (
        <p className={NOTICE} style={{ borderColor: "var(--success)", color: "var(--success)" }}>
          Invite sent. They&apos;ll appear in the staff list above.
        </p>
      )}

      <input type="hidden" name="club_id" value={clubId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="manager-first-name" className="text-sm font-medium" style={{ color: "var(--text)" }}>
            First name
          </label>
          <input id="manager-first-name" name="first_name" type="text" required className={INPUT} style={INPUT_STYLE} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="manager-last-name" className="text-sm font-medium" style={{ color: "var(--text)" }}>
            Last name
          </label>
          <input id="manager-last-name" name="last_name" type="text" required className={INPUT} style={INPUT_STYLE} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="manager-email" className="text-sm font-medium" style={{ color: "var(--text)" }}>
          Email
        </label>
        <input id="manager-email" name="email" type="email" required className={INPUT} style={INPUT_STYLE} />
      </div>

      <SubmitButton label="Send manager invite" pendingLabel="Sending…" />
    </form>
  );
}

export function RemoveManagerButton({
  clubId,
  profileId,
  name,
}: {
  clubId: string;
  profileId: string;
  name: string;
}) {
  const [state, formAction] = useActionState(removeClubManager, initialState);
  // Two-click confirm instead of a browser dialog: removal can't be undone
  // from this screen (re-adding an existing person is a deferred role
  // change), so an accidental single click must not be enough.
  const [arming, setArming] = useState(false);

  if (!arming) {
    return (
      <button
        type="button"
        onClick={() => setArming(true)}
        className="text-xs font-medium"
        style={{ color: "var(--danger)" }}
      >
        Remove
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="club_id" value={clubId} />
      <input type="hidden" name="profile_id" value={profileId} />
      <button type="submit" className="text-xs font-semibold" style={{ color: "var(--danger)" }}>
        Confirm remove {name}
      </button>
      <button
        type="button"
        onClick={() => setArming(false)}
        className="text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        Cancel
      </button>
      {state.error && (
        <span role="alert" className="text-xs" style={{ color: "var(--danger)" }}>
          {state.error}
        </span>
      )}
    </form>
  );
}
