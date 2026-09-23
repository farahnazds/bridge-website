import type { Metadata } from "next";
import InviteConsultantForm from "./InviteConsultantForm";

export const metadata: Metadata = { title: "Invite Consultant — Super Admin — Bridgetx" };

export default function NewConsultantPage() {
  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Invite Consultant
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Creates their login and sends an activation email. You&apos;ll assign clubs and commission terms next.
        </p>
      </div>
      <InviteConsultantForm />
    </div>
  );
}
