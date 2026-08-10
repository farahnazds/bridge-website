"use client";

import { useActionState } from "react";
import { BTN_PRIMARY, BTN_TERTIARY } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import DownloadCsvTemplateButton from "@/components/DownloadCsvTemplateButton";
import { previewAthleteCsv, confirmAthleteImport, type PreviewState, type ConfirmState } from "./actions";

const previewInitialState: PreviewState = { error: null, rows: [] };
const confirmInitialState: ConfirmState = { error: null, results: null };

const inputClass =
  "rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-transparent focus:ring-2 focus:ring-[color:var(--brand-blue)]";
const inputStyle = { borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text)" };

const TEMPLATE_HEADERS = [
  "first_name",
  "last_name",
  "email",
  "code",
  "team",
  "sport",
  "position",
  "tier",
  "dob",
  "gender",
  "diet_preference",
];
const TEMPLATE_EXAMPLE_ROWS = [
  [
    "John",
    "Smith",
    "john.smith@example.com",
    "",
    "First Team",
    "Basketball",
    "Guard",
    "development",
    "2008-04-12",
    "male",
    "none",
  ],
];

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "var(--success)" },
  duplicate: { label: "Already exists", color: "var(--text-muted)" },
  error: { label: "Error", color: "var(--danger)" },
};

function ErrorBanner({ error }: { error: string | null }) {
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

function PreviewButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={BTN_PRIMARY}
      style={{ backgroundImage: "var(--brand-gradient)" }}
    >
      {pending ? "Parsing…" : "Preview import"}
    </button>
  );
}

function ConfirmButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || count === 0}
      className={BTN_PRIMARY}
      style={{ backgroundImage: "var(--brand-gradient)" }}
    >
      {pending ? "Importing…" : `Confirm import (${count})`}
    </button>
  );
}

export default function ImportAthletesClient({ clubId }: { clubId: string }) {
  const [previewState, previewAction] = useActionState(previewAthleteCsv, previewInitialState);
  const [confirmState, confirmAction] = useActionState(confirmAthleteImport, confirmInitialState);

  // ---- Phase 3: results ----
  if (confirmState.results) {
    const created = confirmState.results.filter((r) => r.status === "created");
    const failed = confirmState.results.filter((r) => r.status === "failed");
    return (
      <div className="flex flex-col gap-6">
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            Import complete — {created.length} athlete{created.length === 1 ? "" : "s"} created
            {failed.length > 0 ? `, ${failed.length} failed` : ""}.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {confirmState.results.map((r) => (
            <div
              key={r.rowNumber}
              className="flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm"
              style={{ borderColor: "var(--border)" }}
            >
              <span style={{ color: "var(--text)" }}>
                Row {r.rowNumber} — {r.name}
              </span>
              <span style={{ color: r.status === "created" ? "var(--success)" : "var(--danger)" }}>
                {r.status === "created" ? "Created" : "Failed"}
                {r.message ? ` — ${r.message}` : ""}
              </span>
            </div>
          ))}
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

  // ---- Phase 2: preview ----
  if (previewState.rows.length > 0) {
    const newRows = previewState.rows.filter((r) => r.status === "new");
    const duplicateCount = previewState.rows.filter((r) => r.status === "duplicate").length;
    const errorCount = previewState.rows.filter((r) => r.status === "error").length;

    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--text-muted)" }}>
          <span>
            <strong style={{ color: "var(--success)" }}>{newRows.length}</strong> will be created
          </span>
          <span>
            <strong style={{ color: "var(--text-muted)" }}>{duplicateCount}</strong> already exist (skipped)
          </span>
          <span>
            <strong style={{ color: "var(--danger)" }}>{errorCount}</strong> have errors (skipped)
          </span>
        </div>

        <div
          className="overflow-x-auto rounded-xl border"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
        >
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Row", "Name", "Email", "Code", "Team", "Status", "Details"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 font-medium" style={{ color: "var(--text-muted)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewState.rows.map((r, i) => {
                const display = STATUS_STYLE[r.status];
                return (
                  <tr key={r.rowNumber} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    <td className="whitespace-nowrap px-4 py-2.5" style={{ color: "var(--text-muted)" }}>
                      {r.rowNumber}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium" style={{ color: "var(--text)" }}>
                      {r.firstName} {r.lastName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5" style={{ color: "var(--text)" }}>
                      {r.email || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      {r.code}
                      {r.codeWasGenerated ? " (auto)" : ""}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5" style={{ color: "var(--text)" }}>
                      {r.teamName || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium"
                        style={{ color: display.color }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: display.color }} />
                        {display.label}
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

        <form action={confirmAction} className="flex flex-col gap-4">
          <input type="hidden" name="club_id" value={clubId} />
          <input type="hidden" name="rows_json" value={JSON.stringify(newRows)} />
          <ErrorBanner error={confirmState.error} />
          <div className="flex gap-2">
            <ConfirmButton count={newRows.length} />
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

  // ---- Phase 1: upload ----
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Upload a CSV of athletes to add in bulk. Teams can be mixed within one file — each row
          specifies its own team.
        </p>
        <DownloadCsvTemplateButton
          filename="bridgetx-athlete-import-template.csv"
          headers={TEMPLATE_HEADERS}
          exampleRows={TEMPLATE_EXAMPLE_ROWS}
        />
      </div>

      <form action={previewAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="club_id" value={clubId} />
        <ErrorBanner error={previewState.error} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="csv_file" className="text-sm font-medium" style={{ color: "var(--text)" }}>
            CSV file
          </label>
          <input id="csv_file" name="csv_file" type="file" accept=".csv" required className={inputClass} style={inputStyle} />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Required columns: first_name, last_name, email, sport, team. Code is optional —
            auto-generated if left blank.
          </p>
        </div>

        <PreviewButton />
      </form>
    </div>
  );
}
