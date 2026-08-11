import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import DashboardHeader from "@/components/DashboardHeader";
import { resolvePostLoginPath } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { getAccountIdentity, displayName } from "./identity";

// Chrome for /account.
//
// The same DashboardHeader every dashboard uses, so the account menu is still
// in the top-right and the page does not feel like it left the product. No
// sidebar, because /account sits outside every role tree and there is no
// club/team/athlete context to navigate within — the back link resolves to
// wherever this caller's dashboard actually is instead.
//
// resolvePostLoginPath() is reused rather than a hardcoded "/" so a Club
// Practitioner returns to their last team and a Club Manager to their last
// club, exactly as they would after signing in (migration 030).

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const identity = await getAccountIdentity();
  if (!identity) redirect("/login");

  const backHref = await resolvePostLoginPath();

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "var(--bg)" }}>
      <DashboardHeader
        name={displayName(identity)}
        email={identity.profile.email}
        role={ROLE_LABELS[identity.profile.role] ?? "Account"}
        homeHref={backHref}
      />
      <main className="flex-1 px-8 py-8">
        <div className="mx-auto w-full max-w-3xl">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-xs"
            style={{ color: "var(--brand-blue)" }}
          >
            <ChevronLeft size={14} aria-hidden="true" />
            Back to dashboard
          </Link>
        </div>
        <div className="mt-4">{children}</div>
      </main>
    </div>
  );
}
