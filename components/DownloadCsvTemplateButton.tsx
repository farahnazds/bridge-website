"use client";

// Reusable across every CSV import type (docs/04-user-flows.md Flow 6, step
// 1 — "download template button next to the uploader"). Pass different
// headers/filename/exampleRows for GPS, body composition, etc. — the
// download mechanism itself never changes.
export default function DownloadCsvTemplateButton({
  filename,
  headers,
  exampleRows,
}: {
  filename: string;
  headers: string[];
  exampleRows: string[][];
}) {
  function handleDownload() {
    const csvLines = [headers.join(","), ...exampleRows.map((row) => row.join(","))];
    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors duration-150"
      style={{ borderColor: "var(--border)", color: "var(--text)" }}
    >
      Download CSV template
    </button>
  );
}
