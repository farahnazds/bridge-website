import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import LibraryClient, { type LibraryEntry } from "./LibraryClient";

export const metadata: Metadata = { title: "Clinical + Research — Super Admin — Bridgetx" };

// The Clinical + Research library. docs/03-site-map.md lists it under Super
// Admin and marks it Super-Admin-only; docs/07-ai-engine.md makes it the AI's
// ONLY citation source, with no external fallback permitted.
//
// It had no route anywhere in the app until now, so the table sat empty and
// every report generated with nothing to cite.
//
// Read through the caller's client: the "super admin only" RLS policy is the
// real boundary, and the layout's role check sits on top of it. Report
// generation reads the same table by a different path — service role, see
// lib/clinicalLibrary.ts — because a practitioner cannot pass this policy.

export default async function ClinicalResearchPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinical_research_library")
    .select("id, topic_tag, year, title, source, clinical_note")
    .order("topic_tag")
    .order("year", { ascending: false });

  const entries = (data ?? []) as LibraryEntry[];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Clinical + Research Library
        </h1>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--text-muted)" }}>
          The only source generated reports may cite. The AI checks this library for entries matching
          a report&apos;s topic and cites them where genuinely relevant — it will never reach for an
          external source, so a topic with no entries produces a report with no citations rather than
          an unverified one.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          Couldn&apos;t load the library: {error.message}
        </p>
      )}

      {!error && entries.length === 0 && (
        <p className="rounded-lg border px-4 py-3 text-sm"
          style={{
            borderColor: "var(--warning)",
            color: "var(--text)",
            backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
          }}>
          The library is empty, so every report currently generates with no citations. Adding entries
          below changes that immediately — nothing needs redeploying.
        </p>
      )}

      {!error && <LibraryClient entries={entries} />}
    </div>
  );
}
