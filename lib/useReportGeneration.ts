"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GenerateReportState } from "@/app/staff/[teamId]/reports/actions";

// Client half of the fetch-based generation flow — the replacement for the
// useActionState wiring the six report forms shipped with. See
// app/api/reports/generate/route.ts for why this is a fetch and not a server
// action (short version: an in-flight action freezes ALL app navigation).
//
// Deliberately the same state shape the forms already render, so swapping the
// invocation changed nothing about error/result display.

const INITIAL: GenerateReportState = {
  error: null,
  reportText: null,
  dataCheckNote: null,
  reportId: null,
};

export function useReportGeneration(kind: string): {
  state: GenerateReportState;
  pending: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
} {
  const router = useRouter();
  const [state, setState] = useState<GenerateReportState>(INITIAL);
  const [pending, setPending] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const formData = new FormData(e.currentTarget);
    formData.set("report_kind", kind);
    void (async () => {
      setPending(true);
      setState(INITIAL);
      try {
        const res = await fetch("/api/reports/generate", { method: "POST", body: formData });
        const json = (await res.json().catch(() => null)) as GenerateReportState | null;
        setState(
          json ?? { ...INITIAL, error: `Report generation failed (HTTP ${res.status}).` }
        );
        // Refresh server components so the History badge and bell reflect the
        // new report — the fetch path gets no revalidation piggyback the way
        // a server action response did.
        if (json?.reportId) router.refresh();
      } catch {
        setState({
          ...INITIAL,
          error:
            "Network interrupted while waiting. The report may still complete server-side — check Report history, and the bell will notify you either way.",
        });
      } finally {
        setPending(false);
      }
    })();
  };

  return { state, pending, onSubmit };
}
