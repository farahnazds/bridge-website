import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AthleteForm from "./AthleteForm";
import { CARD } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Register Athlete — Bridgetx",
};

export default async function NewAthletePage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  const supabase = await createClient();

  const [{ data: club }, { data: teams }, { data: conditions }, { data: allergies }, { data: intolerances }] =
    await Promise.all([
      // The club's own sport (set by Super Admin at club creation) pre-fills
      // the form's Sport field — editable, but saves re-entry per athlete.
      // clubs has NO country column (only free-text location), so Country
      // cannot be defaulted the same way yet.
      supabase.from("clubs").select("sport").eq("id", clubId).maybeSingle(),
      supabase.from("teams").select("id, name, category").eq("club_id", clubId).order("name"),
      supabase.from("medical_conditions").select("code, label").order("label"),
      supabase.from("allergies").select("code, label").order("label"),
      supabase.from("intolerances").select("code, label").order("label"),
    ]);

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
          Register athlete
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Adds the athlete and sends them an activation invite. Photo is uploaded by you — club
          athletes have no self-editable profile fields, not even photo.
        </p>
      </div>

      <div
        className={`max-w-2xl ${CARD} p-6 shadow-sm`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        <AthleteForm
          clubId={clubId}
          clubSport={(club?.sport as string | undefined)?.trim() || null}
          teams={teams ?? []}
          conditions={conditions ?? []}
          allergies={allergies ?? []}
          intolerances={intolerances ?? []}
        />
      </div>
    </div>
  );
}
