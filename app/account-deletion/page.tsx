import type { Metadata } from "next";
import Link from "next/link";
import BookShell from "@/app/book/BookShell";
import { COMPANY } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Close your account — Bridgetx",
  description: "How to ask Bridgetx to close your athlete account, and what happens to your data when you do.",
};

// Public "delete account" URL for the Google Play Console data-safety form.
// Google requires it to name the app/developer as on the store listing, give
// the steps to request closure, and say what is and isn't deleted.
//
// WORDING IS DELIBERATELY "CLOSE", NOT "DELETE": closing suspends login only;
// the practitioner/club record is not erased (docs/04-user-flows.md Flow 4,
// privacy policy §10-11). Do not soften that into "deleted".
//
// IN_APP_CLOSURE_SHIPPED: the in-app screen (More -> Close my account) is built
// in the mobile repo but only exists in builds made after it. Flip to true only
// once a build containing it is live on Google Play, or this page describes a
// button users cannot find.
const IN_APP_CLOSURE_SHIPPED = false;

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
          Close your Bridgetx account
        </h1>
        <p className="m-0 text-[17px]" style={P_STYLE}>
          For athletes using the Bridgetx app, provided by {COMPANY.name}.
        </p>
      </div>

      <div className="flex w-full max-w-[600px] flex-col gap-8 text-[15px]">
        <section className="flex flex-col gap-2.5">
          <h2 className={H2} style={H2_STYLE}>How to request it</h2>
          <ol className="m-0 flex list-decimal flex-col gap-2 pl-5" style={P_STYLE}>
            {IN_APP_CLOSURE_SHIPPED && (
              <li>
                In the Bridgetx app, open <strong>More</strong> and tap <strong>Close my account</strong>. Or:
              </li>
            )}
            <li>
              Email {MAIL}{" "}
              from the address your account uses, with the subject &ldquo;Close my account&rdquo;. If you can&rsquo;t
              email from that address, include your full name and your club so we can confirm it&rsquo;s you.
            </li>
            <li>
              Or send us a message on the <Link href="/support" style={{ color: "var(--brand-blue)" }}>support page</Link>.
            </li>
          </ol>
          <p className="m-0" style={P_STYLE}>
            We&rsquo;ll complete your request within one month of receiving it, as our{" "}
            <Link href="/privacy#rights" style={{ color: "var(--brand-blue)" }}>Privacy Policy</Link> promises.
          </p>
        </section>

        <section className="flex flex-col gap-2.5">
          <h2 className={H2} style={H2_STYLE}>What closing your account does</h2>
          <p className="m-0" style={P_STYLE}>
            Your login is disabled. You can no longer sign in to the Bridgetx app or see your dashboard, reports or check-ins.
          </p>
        </section>

        <section className="flex flex-col gap-2.5">
          <h2 className={H2} style={H2_STYLE}>What is not deleted, and why</h2>
          <p className="m-0" style={P_STYLE}>
            Closing your account is not the same as erasing your records. The body composition, protocols, reports, check-ins and
            other health and performance data in your dashboard are entered, managed and viewed by your practitioner and club as part
            of their professional records. That data stays part of those records after you close your account, because it is their
            operational record and not only your personal content. This is also true when your club or practitioner stops working
            with you: ending that relationship never deletes the history.
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
