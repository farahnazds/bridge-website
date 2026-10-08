"use client";

import { useActionState, useState } from "react";
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";
import { restoreDeletedAthlete, type RestoreResult } from "./actions";

// One row's restore control. Two steps so a stray click cannot reverse
// someone's own decision: open it, review (optionally correct) the details,
// then confirm.

const initial: RestoreResult = { error: null, ok: false };

export default function RestoreForm({
  athleteId,
  originalFirst,
  originalLast,
  originalEmail,
}: {
  athleteId: string;
  originalFirst: string;
  originalLast: string;
  originalEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(restoreDeletedAthlete, initial);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`w-fit ${BTN_SECONDARY}`}>
        Restore…
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="athlete_id" value={athleteId} />
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        This reverses the athlete&rsquo;s own decision. Their login comes back with their old password, and their name and
        email are put back as shown. Change a field only if it needs correcting.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
          First name
          <input name="first_name" defaultValue={originalFirst} className={INPUT} style={INPUT_STYLE} />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
          Last name
          <input name="last_name" defaultValue={originalLast} className={INPUT} style={INPUT_STYLE} />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
          Email
          <input name="email" type="email" defaultValue={originalEmail} className={INPUT} style={INPUT_STYLE} />
        </label>
      </div>

      {state.error && (
        <p role="alert" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={`w-fit ${BTN_PRIMARY}`}>
          {pending ? "Restoring…" : "Confirm restore"}
        </button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)} className={`w-fit ${BTN_SECONDARY}`}>
          Cancel
        </button>
      </div>
    </form>
  );
}
