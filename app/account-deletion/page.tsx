import type { Metadata } from "next";
import Link from "next/link";
import BookShell from "@/app/book/BookShell";
import { COMPANY } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Delete your account — Bridgetx",
  description: "How to delete your Bridgetx athlete account, and exactly what is and isn't deleted when you do.",
};

// Public "delete account" URL for the Google Play Console data-safety form.
// Google requires it to name the app/developer as on the store listing, give
// the steps to delete the account, and say what is and isn't deleted.
//
// WORDING (owner decision 2026-10-04, migration 069): this is DELETION of the
// account, and it says so. It is not erasure of the club's records, and the
// page says THAT just as plainly. Three things must stay true to the code:
//   1. login is permanently removed (no sign-in, password reset or magic link);
//   2. name, email and photo are anonymized;
//   3. history is kept, AND a restricted copy of the original name/email is
//      retained for restoration, readable only by the platform operator.
// If delete_my_account() / athlete_deletion_vault change, change this page and
// privacy policy §10-11 with them.
//
// IN_APP_DELETION_SHIPPED: the in-app screen (More -> Delete my account) is
// built in the mobile repo but only exists in builds made after it. Flip to
// true only once a build containing it is live, or this page describes a
// button users cannot find.
const IN_APP_DELETION_SHIPPED = false;

const MAIL = (
  <a href={`mailto:${COMPANY.contact}`} style={{ color: "var(--brand-blue)" }}>{COMPANY.contact}</a>
);

const H2 = "m-0 text-[20px] font-semibold";
const H2_STYLE = { fontFamily: "var(--font-heading)", color: "var(--text)", letterSpacing: "-.02em" } as const;
const P_STYLE = { lineHeight: 1.65, color: "var(--text-muted)", textWrap: "pretty" } as const;

export default function AccountDeletionPage() {
  return (
    <BookShell>
      <div className="flex max-w-[600px] flex-col items-center gap-3.5 text-center">
        <h1
          className="m-0 text-[clamp(34px,5vw,46px)] font-semibold"
          style={{ fontFamily: "var(--font-heading)", lineHeight: 1.06, letterSpacing: "-.034em", color: "var(--text)", textWrap: "pretty" }}
        >
          Delete your Bridgetx account
        </h1>
        <p className="m-0 text-[17px]" style={P_STYLE}>
          For athletes using the Bridgetx app, provided by {COMPANY.name}.
        </p>
      </div>

      <div className="flex w-full max-w-[600px] flex-col gap-8 text-[15px]">
        <section className="flex flex-col gap-2.5">
          <h2 className={H2} style={H2_STYLE}>How to request it</h2>
          <ol className="m-0 flex list-decimal flex-col gap-2 pl-5" style={P_STYLE}>
            {IN_APP_DELETION_SHIPPED && (
              <li>
                In the Bridgetx app, open <strong>More</strong>, tap <strong>Delete my account</strong> and confirm. It takes
                effect immediately. Or:
              </li>
            )}
            <li>
              Email {MAIL}{" "}
              from the address your account uses, with the subject &ldquo;Delete my account&rdquo;. If you can&rsquo;t
              email from that address, include your full name and your club so we can confirm it&rsquo;s you.
            </li>
            <li>
              Or send us a message on the <Link href="/support" style={{ color: "var(--brand-blue)" }}>support page</Link>.
            </li>
          </ol>
          <p className="m-0" style={P_STYLE}>
            If you ask by email or the support page, we&rsquo;ll complete your request within one month of receiving it, as our{" "}
            <Link href="/privacy#rights" style={{ color: "var(--brand-blue)" }}>Privacy Policy</Link> promises.
          </p>
        </section>

        <section className="flex flex-col gap-2.5">
          <h2 className={H2} style={H2_STYLE}>What deleting your account does</h2>
          <p className="m-0" style={P_STYLE}>
            Your login is permanently removed. You can no longer sign in to the Bridgetx app, and resetting your password or asking
            for a sign-in link will not bring it back. You can no longer see your dashboard, reports or check-ins.
          </p>
          <p className="m-0" style={P_STYLE}>
            Your personal details are anonymized: your name becomes &ldquo;Deleted Athlete&rdquo;, your email address is replaced with
            a placeholder that cannot receive mail, and your profile photo is removed from your record.
          </p>
        </section>

        <section className="flex flex-col gap-2.5">
          <h2 className={H2} style={H2_STYLE}>What is not deleted, and why</h2>
          <p className="m-0" style={P_STYLE}>
            Deleting your account is not the same as erasing your records. The body composition, protocols, reports, check-ins and
            other health and performance data in your dashboard are entered, managed and viewed by your practitioner and club as part
            of their professional records. That data stays part of those records after you delete your account, now attributed to &ldquo;Deleted Athlete&rdquo;, because it is their
            operational record and not only your personal content. This is also true when your club or practitioner stops working
            with you: ending that relationship never deletes the history.
          </p>
          <p className="m-0" style={P_STYLE}>
            <strong>One copy of your original name and email is retained.</strong> It is kept separately from the records above,
            can be read only by the Bridgetx platform operator, and exists only so that your account can be restored if you ask us to
            or if the deletion was a mistake. It is removed if the account is restored. If you want that copy erased as well, email{" "}
            {MAIL}.
          </p>
          <p className="m-0" style={P_STYLE}>
            If you want to ask what we hold about you, or want to ask for data to be deleted, email {MAIL}. We&rsquo;ll consider
            it under data protection law and tell you what we can do, which may involve consulting your club. See our{" "}
            <Link href="/privacy#retention" style={{ color: "var(--brand-blue)" }}>Privacy Policy</Link> for how long data is kept.
          </p>
        </section>

        <p className="m-0 text-[13px]" style={P_STYLE}>
          {COMPANY.name} (company no. {COMPANY.number}), {COMPANY.address}.
        </p>
      </div>
    </BookShell>
  );
}
