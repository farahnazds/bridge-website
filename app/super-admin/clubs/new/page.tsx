import type { Metadata } from "next";
import Link from "next/link";
import ClubForm from "./ClubForm";
import { CARD } from "@/lib/ui";

export const metadata: Metadata = {
  title: "New Club — Super Admin — Bridgetx",
};

export default function NewClubPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/super-admin/clubs"
          className="text-sm font-medium transition-colors duration-150 hover:opacity-80"
          style={{ color: "var(--brand-blue)" }}
        >
          ← Clubs
        </Link>
        <h1
          className="mt-3 text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          New club
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Creates the club and sends its Club Manager an activation invite.
        </p>
      </div>

      <div
        className={`max-w-2xl ${CARD} p-6 shadow-sm`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        <ClubForm />
      </div>
    </div>
  );
}
