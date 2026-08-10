"use client";

import { useActionState } from "react";
import { BTN_PRIMARY, BTN_TERTIARY } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import DownloadCsvTemplateButton from "@/components/DownloadCsvTemplateButton";
import type { MatchedRow } from "@/lib/csvImport";

// Generic two-phase (preview -> confirm) CSV panel for DATA-ENTRY imports,
// per docs/04-user-flows.md Flow 6. The athlete-registration importer proved
// the shape; this generalises it so GPS, VALD and later body-composition
// share one implementation. The caller supplies its own server actions and a
// summary renderer for the value columns.

const inputClass =
  "rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-transparent focus:ring-2 focus:ring-[color:var(--brand-blue)]";
const inputStyle = { borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text)" };

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  matched: { label: "Matched", color: "var(--success)" },
  unmatched: { label: "No match", color: "var(--warning)" },
  error: { label: "Error", color: "var(--danger)" },
};

interface PreviewShape<T> {
  error: string | null;
  rows: MatchedRow<T>[];
}
interface ConfirmShape {
  error: string | null;
  savedCount: number | null;
}

function Banner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border px-4 py-3 text-sm"
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

function Submit({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={BTN_PRIMARY}
      style={{ backgroundImage: "var(--brand-gradient)" }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export default function DataCsvImportPanel<T>({
  teamId,
  templateFilename,
  templateHeaders,
  templateExample,
  previewAction,
  confirmAction,
  summarise,
  requiredNote,
}: {
  teamId: string;
  templateFilename: string;
  templateHeaders: string[];
  templateExample: string[][];
  previewAction: (prev: PreviewShape<T>, fd: FormData) => Promise<PreviewShape<T>>;
  confirmAction: (prev: ConfirmShape, fd: FormData) => Promise<ConfirmShape>;
  summarise: (row: MatchedRow<T>) => string;
  requiredNote: string;
}) {
  const [preview, previewFormAction] = useActionState(previewAction, { error: null, rows: [] } as PreviewShape<T>);
  const [confirm, confirmFormAction] = useActionState(confirmAction, {
    error: null,
    savedCount: null,
  } as ConfirmShape);

  if (confirm.savedCount !== null) {
    return (
      <div className="flex flex-col gap-4">
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--success)" }}>
            Imported {confirm.savedCount} row{confirm.savedCount === 1 ? "" : "s"}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="self-start rounded-lg border px-4 py-2.5 text-sm font-medium"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          Import another file
        </button>
      </div>
    );
  }

  if (preview.rows.length > 0) {
    const matched = preview.rows.filter((r) => r.status === "matched");
    const unmatched = preview.rows.filter((r) => r.status === "unmatched").length;
    const errored = preview.rows.filter((r) => r.status === "error").length;

    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--text-muted)" }}>
          <span>
            <strong style={{ color: "var(--success)" }}>{matched.length}</strong> will be imported
          </span>
          <span>
            <strong style={{ color: "var(--warning)" }}>{unmatched}</strong> no athlete match (skipped)
          </span>
          <span>
            <strong style={{ color: "var(--danger)" }}>{errored}</strong> errors (skipped)
          </span>
        </div>

        <div
          className="overflow-x-auto rounded-xl border"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Row", "Athlete code", "Athlete", "Date", "Values", "Status", "Details"].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-4 py-3 font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r, i) => {
                const s = STATUS_STYLE[r.status];
                return (
                  <tr key={r.rowNumber} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>
                      {r.rowNumber}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-2.5"
                      style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}
                    >
                      {r.athleteCode}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5" style={{ color: "var(--text)" }}>
                      {r.athleteName ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5" style={{ color: "var(--text)" }}>
                      {r.date || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {summarise(r)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium"
                        style={{ color: s.color }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {r.message ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <form action={confirmFormAction} className="flex flex-col gap-3">
          <input type="hidden" name="team_id" value={teamId} />
          <input type="hidden" name="rows_json" value={JSON.stringify(matched)} />
          <Banner error={confirm.error} />
          <div className="flex gap-2">
            <Submit label={`Confirm import (${matched.length})`} pending="Importing…" />
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={BTN_TERTIARY}
              style={{ color: "var(--text-muted)" }}
            >
              Choose a different file
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Rows are matched to athletes by athlete code. Nothing saves until you confirm.
        </p>
        <DownloadCsvTemplateButton
          filename={templateFilename}
          headers={templateHeaders}
          exampleRows={templateExample}
        />
      </div>

      <form action={previewFormAction} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="team_id" value={teamId} />
        <Banner error={preview.error} />
        <input name="csv_file" type="file" accept=".csv" required className={inputClass} style={inputStyle} />
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {requiredNote}
        </p>
        <div>
          <Submit label="Preview import" pending="Parsing…" />
        </div>
      </form>
    </div>
  );
}
