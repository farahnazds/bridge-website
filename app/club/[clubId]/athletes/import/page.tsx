import type { Metadata } from "next";
import Link from "next/link";
import ImportAthletesClient from "./ImportAthletesClient";

export const metadata: Metadata = { title: "Import Athletes — Bridgetx" };

export default async function ImportAthletesPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href={`/club/${clubId}/athletes`}
          className="text-sm font-medium transition-colors duration-150 hover:opacity-80"
          style={{ color: "var(--brand-blue)" }}
        >
          ← Athletes
        </Link>
        <h1
          className="mt-3 text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          Import athletes from CSV
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Download the template, fill it in, upload, review the preview, then confirm. Nothing
          saves until you confirm.
        </p>
      </div>

      <div
        className="max-w-4xl rounded-xl border p-6 shadow-sm"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        <ImportAthletesClient clubId={clubId} />
      </div>
    </div>
  );
}
