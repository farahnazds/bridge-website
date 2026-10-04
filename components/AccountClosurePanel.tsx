"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, NOTICE } from "@/lib/ui";
import {
  processAthleteClosure,
  reverseAthleteClosure,
  type ClosureActionResult,
} from "@/app/super-admin/athlete-closures/actions";
import type { ClosureStatus } from "@/lib/athleteClosure";

// Shown on an athlete's profile whenever they have an OPEN closure request.
// Everyone who can see the athlete sees the status line; only a Super Admin
// gets the buttons (the server actions re-check — this flag only decides
// whether to draw them).

export default function AccountClosurePanel({
  closureId,
  status,
  label,
  canProcess,
}: {
  closureId: string;
  status: Exclude<ClosureStatus, "reversed">;
  label: string;
  canProcess: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const run = (fn: (fd: FormData) => Promise<ClosureActionResult>) =>
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("closure_id", closureId);
      const res = await fn(fd);
      if (res.error) setError(res.error);
      setConfirming(false);
    });

  const closed = status === "processed";

  // Self-deleted (migration 069). Nothing to process: the deletion already
  // happened. Everyone who can see the athlete sees why the name is anonymized;
  // restoring is a separate Super Admin page.
  if (status === "deleted") {
    return (
      <div
        className={`flex flex-col gap-3 ${CARD} p-5`}
        style={{ borderColor: "var(--danger)", backgroundColor: "var(--surface)" }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            {label}
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            This athlete deleted their own account. Their login was removed and their name, email and photo were
            anonymized. Their check-ins, assessments, reports and history are unchanged and remain part of the
            club&rsquo;s records.
          </p>
        </div>
        {canProcess && (
          <Link href="/super-admin/closed-accounts" className={`w-fit ${BTN_SECONDARY}`}>
            Open Closed Accounts
          </Link>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col gap-3 ${CARD} p-5`}
      style={{ borderColor: closed ? "var(--danger)" : "var(--warning)", backgroundColor: "var(--surface)" }}
    >
      <div>
        <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          {label}
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {closed
            ? "This athlete can no longer sign in to the app. Nothing has been deleted — all of their records remain visible to the club and practitioners exactly as before."
            : "This athlete asked to close their account. They can still sign in until a Super Admin processes the request. Closing only suspends their login; no records are deleted."}
        </p>
      </div>

      {error && (
        <p role="alert" className={NOTICE} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {canProcess && (
        <div className="flex flex-wrap gap-3">
          {!closed && !confirming && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(true)}
              className={`w-fit ${BTN_SECONDARY}`}
              style={{ border: "1px solid var(--danger)", color: "var(--danger)" }}
            >
              Process closure…
            </button>
          )}
          {!closed && confirming && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(processAthleteClosure)}
                className={`w-fit ${BTN_PRIMARY}`}
                style={{ border: "1px solid var(--danger)", color: "var(--danger)", backgroundColor: "transparent" }}
              >
                {pending ? "Working…" : "Confirm: suspend login now"}
              </button>
              <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={`w-fit ${BTN_SECONDARY}`}>
                Cancel
              </button>
            </>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(reverseAthleteClosure)}
            className={`w-fit ${BTN_SECONDARY}`}
          >
            {closed ? "Reinstate account" : "Decline request"}
          </button>
        </div>
      )}
    </div>
  );
}
