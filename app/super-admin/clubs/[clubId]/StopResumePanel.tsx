"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { setClubStopped, type ClubStateResult } from "./actions";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, NOTICE } from "@/lib/ui";

const initial: ClubStateResult = { error: null, stopped: null };

function SubmitButton({ label, danger }: { label: string; danger: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`w-fit ${BTN_PRIMARY}`}
      style={
        danger
          ? { border: "1px solid var(--danger)", color: "var(--danger)", backgroundColor: "transparent" }
          : { backgroundImage: "var(--brand-gradient-action)", color: "#fff" }
      }
    >
      {pending ? "Working…" : label}
    </button>
  );
}

export default function StopResumePanel({
  clubId,
  clubName,
  stopped,
}: {
  clubId: string;
  clubName: string;
  stopped: boolean;
}) {
  const [state, action] = useActionState(setClubStopped, initial);
  const [confirming, setConfirming] = useState(false);
  const isStopped = state.stopped ?? stopped;

  return (
    <div
      className={`flex flex-col gap-4 ${CARD} p-5`}
      style={{ borderColor: isStopped ? "var(--danger)" : "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <div>
        <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Access
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {isStopped
            ? "This club is stopped. Its staff and athletes see a “talk to support” message rather than an error, and no data has been deleted."
            : "This club has normal access. Stopping it is reversible and never deletes anything."}
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

      {isStopped ? (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="club_id" value={clubId} />
          <input type="hidden" name="stopped" value="false" />
          <SubmitButton label="Resume access" danger={false} />
        </form>
      ) : !confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`w-fit ${BTN_SECONDARY}`}
          style={{ border: "1px solid var(--danger)", color: "var(--danger)" }}
        >
          Stop this club…
        </button>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="club_id" value={clubId} />
          <input type="hidden" name="stopped" value="true" />
          <label className="text-sm" style={{ color: "var(--text)" }}>
            {/* Typing the name is the guard. This cuts off a live club's whole
                staff and athlete base, so it should not be one stray click. */}
            Type <strong>{clubName}</strong> to confirm:
          </label>
          <input
            name="confirm_name"
            autoComplete="off"
            className="max-w-sm rounded-lg border px-3.5 py-2.5 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[color:var(--danger)]"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text)" }}
          />
          <div className="flex items-center gap-3">
            <SubmitButton label="Stop this club" danger />
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-sm underline-offset-2 hover:underline"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
