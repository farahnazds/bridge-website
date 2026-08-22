import type { Metadata } from "next";
import LegalShell, { LegalH2, LegalP, LegalUL, LegalCallout } from "@/components/legal/LegalShell";
import { COMPANY } from "@/components/SiteFooter";

// ============================================================================
// ⚠️  FIRST DRAFT — NOT LEGALLY REVIEWED. DO NOT RELY ON IN PRODUCTION.
//     See the full banner in components/legal/LegalShell.tsx.
// ============================================================================
// Drafted 2026-08-22 alongside app/privacy/page.tsx, from the same audit of
// this repository. Facts encoded here that a reviewer should re-verify:
//
//   Athlete accounts are club-created ... invite flow, supabase auth
//                                          inviteUserByEmail; athletes do not
//                                          self-register into a club
//   No online payments .................. Stripe is NOT active anywhere in the
//                                          build (docs/08-integrations.md);
//                                          clubs are contract-based, and
//                                          product requests are recorded for
//                                          IN-PERSON fulfilment
//   Prescription brand / discounts ...... club_brand_products carries
//                                          is_prescription_brand and
//                                          discount_percent — reports can
//                                          recommend a sponsor's product, which
//                                          is a material disclosure and is made
//                                          in section 8 rather than buried
//   Subscription lapse .................. read-only grace period then lockout;
//                                          data is NOT deleted
//                                          (docs/05-business-rules.md:99-104)
//   Reports are AI-drafted .............. lib/anthropic.ts, REPORT_MODEL
//   No delete path for reports .......... see the privacy page's provenance block
//
// ⚠️  SECTIONS A LAWYER MUST NOT RUBBER-STAMP:
//   * Section 6 (not medical advice) — this product generates supplement
//     prescriptions and nutrition targets for athletes who may be minors and
//     who may have cardiac conditions, diabetes, or a disordered-eating
//     history. The disclaimer here is drafted in good faith but the real
//     question is whether the liability position is defensible at all, and
//     whether professional indemnity insurance is in place. That is a
//     commercial and regulatory question, not a drafting one.
//   * Section 12 (liability) — the caps are placeholders reflecting common
//     SaaS practice. They have NOT been set against actual contract values,
//     insurance cover, or what UK law will permit to be excluded. Consumer
//     users (independent athletes) cannot have the same terms imposed on them
//     as business customers, and this draft does not yet distinguish them
//     properly.
//   * Section 13 — governing law is asserted as England and Wales, which
//     follows the operating entity. Whether that survives contact with UAE
//     club contracts and consumer-protection rules needs checking.
// ============================================================================

export const metadata: Metadata = {
  title: "Terms of Service — Bridgetx",
  description:
    "The terms on which The Bridge High Performance Ltd provides the Bridgetx platform to clubs, practitioners and athletes.",
};

const UPDATED = "22 AUGUST 2026";

const TOC = [
  { id: "who-we-are", label: "Who we are" },
  { id: "what-it-is", label: "What Bridgetx is" },
  { id: "accounts", label: "Accounts and eligibility" },
  { id: "young-athletes", label: "Young athletes" },
  { id: "roles", label: "Clubs, practitioners and athletes" },
  { id: "not-medical-advice", label: "Not medical advice" },
  { id: "ai", label: "AI-generated content" },
  { id: "supplements", label: "Supplements and sponsored brands" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "subscriptions", label: "Subscriptions and payment" },
  { id: "ip", label: "Intellectual property" },
  { id: "availability", label: "Availability" },
  { id: "liability", label: "Liability" },
  { id: "termination", label: "Suspension, termination and your data" },
  { id: "law", label: "Governing law" },
  { id: "changes", label: "Changes and contact" },
];

const MAIL = <a href={`mailto:${COMPANY.contact}`} style={{ color: "var(--brand-blue)" }}>{COMPANY.contact}</a>;
const PRIVACY = <a href="/privacy" style={{ color: "var(--brand-blue)" }}>Privacy Policy</a>;

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      subtitle="The terms on which clubs, practitioners and athletes use Bridgetx — including the limits of what an AI-generated nutrition report is, and is not."
      updated={UPDATED}
      toc={TOC}
    >
      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="who-we-are">1. Who we are</LegalH2>
      <LegalP>
        Bridgetx is operated by <strong>{COMPANY.name}</strong>, a company registered in England and Wales under company number{" "}
        {COMPANY.number}, registered office {COMPANY.address}. In these terms, &ldquo;we&rdquo;, &ldquo;us&rdquo; and
        &ldquo;Bridgetx&rdquo; mean {COMPANY.name}, and &ldquo;you&rdquo; means the club, practitioner or athlete using the platform.
      </LegalP>
      <LegalP>
        By using Bridgetx you agree to these terms. If you are accepting them for a club or organisation, you confirm you are
        authorised to bind it.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="what-it-is">2. What Bridgetx is</LegalH2>
      <LegalP>
        Bridgetx is a sports nutrition and performance intelligence platform. It lets clubs and practitioners record athlete profiles,
        assessments, injuries, training and performance data and daily check-ins; and it generates nutrition, body-composition,
        compliance and injury reports, which can include supplement guidance.
      </LegalP>
      <LegalP>
        It is a professional tool intended to be used by, or under the supervision of, qualified performance and medical staff. It is
        not a consumer health app and it is not a medical device.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="accounts">3. Accounts and eligibility</LegalH2>
      <LegalUL>
        <li>Athlete and staff accounts are normally <strong>created by a club</strong> and activated by invitation. Athletes do not sign themselves up to a club.</li>
        <li>You are responsible for keeping your login credentials secure and for activity under your account.</li>
        <li>You must give accurate information, and keep it accurate — clinical guidance generated from wrong data can be wrong in ways that matter.</li>
        <li>Do not share an account. Each practitioner and athlete should have their own.</li>
        <li>Tell us at {MAIL} promptly if you believe an account has been compromised.</li>
      </LegalUL>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="young-athletes">4. Young athletes</LegalH2>
      <LegalP>
        Academy and youth squads routinely include athletes under 18, and Bridgetx is designed to be used with them.
      </LegalP>
      <LegalCallout tone="warn" title="Responsibility sits with the club">
        <p style={{ margin: 0 }}>
          Where a club records data about an athlete under 18, <strong>the club is responsible</strong> for having the necessary consent
          and safeguarding arrangements in place with that athlete and their parents or guardians, and for ensuring that recording their
          health information in Bridgetx is covered by those arrangements.
        </p>
        <p style={{ margin: 0 }}>
          Bridgetx does not currently collect separate parental or guardian consent, does not record guardian contact details, and does
          not enforce a minimum age at sign-up. We describe this openly in our {PRIVACY}, section 9, together with the work we have
          identified to address it.
        </p>
      </LegalCallout>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="roles">5. Clubs, practitioners and athletes</LegalH2>
      <LegalP>
        Where an athlete belongs to a club, the club decides what is recorded about that athlete, which of its staff can see it, and
        which independent practitioners may be granted access. The club is generally the data controller and we act as its processor.
        Our {PRIVACY} explains this in more detail.
      </LegalP>
      <LegalP>
        Practitioners are responsible for exercising their own professional judgement over anything the platform produces, and for
        working within their own scope of practice, professional registration and insurance.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="not-medical-advice">6. Not medical advice</LegalH2>
      <LegalCallout tone="warn" title="Read this one properly">
        <p style={{ margin: 0 }}>
          <strong>Bridgetx does not provide medical advice, diagnosis or treatment.</strong> Nutrition targets, body-composition
          analysis, injury commentary and supplement guidance produced by the platform are decision-support information for qualified
          practitioners. They are not a clinical decision, and they are not a substitute for examination and judgement by a doctor,
          registered dietitian, physiotherapist or other appropriate professional.
        </p>
        <p style={{ margin: 0 }}>
          <strong>A practitioner must review any report before it is acted on or shared with an athlete.</strong> Nothing the platform
          generates should be followed without that review.
        </p>
        <p style={{ margin: 0 }}>
          Athletes: do not change your diet, start or stop a supplement, or alter injury rehabilitation on the strength of a Bridgetx
          report alone. Speak to your club&rsquo;s medical or nutrition staff. If you have a medical condition, are pregnant, or are
          taking medication, get individual professional advice first. If you think you are having a medical emergency, contact your
          local emergency services.
        </p>
        <p style={{ margin: 0 }}>
          If you are subject to anti-doping rules, <strong>you remain solely responsible</strong> for everything you consume. Verify any
          supplement against your governing body&rsquo;s requirements and current batch-testing certification before taking it.
        </p>
      </LegalCallout>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="ai">7. AI-generated content</LegalH2>
      <LegalP>
        Reports are drafted by an AI language model from the data held about the athlete. Language models can be wrong. They can
        misread data, state something with more confidence than the underlying evidence supports, or produce plausible content that is
        not correct.
      </LegalP>
      <LegalUL>
        <li>We build in safeguards — the model is constrained to a curated clinical reference library, guidance is checked against recorded conditions and allergies, and reports are attributed and dated.</li>
        <li>Those safeguards reduce risk. They do not eliminate it.</li>
        <li>Practitioner review is a required step, not an optional one.</li>
        <li>We do not warrant that AI-generated content is accurate, complete or fit for any particular athlete.</li>
      </LegalUL>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="supplements">8. Supplements and sponsored brands</LegalH2>
      <LegalP>
        Clubs may be associated with a supplement brand, and where that is the case, reports and product recommendations for that
        club&rsquo;s athletes may feature that brand&rsquo;s products, and discounts may apply. We state this openly so that nobody
        mistakes a brand recommendation for a purely clinical one.
      </LegalP>
      <LegalP>
        Clinical suitability is assessed separately from commercial pairing: guidance is checked against the athlete&rsquo;s recorded
        conditions, allergies, dietary preference and age before a product is suggested. Even so, the choice of whether to prescribe or
        take any supplement rests with the practitioner and the athlete.
      </LegalP>
      <LegalP>
        Product requests recorded in Bridgetx are handled in person by the club or by us. We do not currently take payment through the
        platform, and recording a request is not a purchase.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="acceptable-use">9. Acceptable use</LegalH2>
      <LegalP>You must not:</LegalP>
      <LegalUL>
        <li>access, or try to access, data about athletes you are not authorised to see;</li>
        <li>export or share athlete health data outside the lawful basis your club or practice relies on;</li>
        <li>use the platform to harass, bully or discriminate against anyone, including through in-platform messaging;</li>
        <li>upload malicious code, probe or attack the service, or attempt to bypass its access controls;</li>
        <li>scrape the platform, or use it to build a competing product;</li>
        <li>misrepresent a Bridgetx report as clinical sign-off by a professional who has not reviewed it.</li>
      </LegalUL>
      <LegalP>
        Report anything you think is a security flaw to {MAIL}. We will not pursue anyone who reports a genuine vulnerability
        responsibly and in good faith.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="subscriptions">10. Subscriptions and payment</LegalH2>
      <LegalP>
        Club access to Bridgetx is provided under a written agreement between us and the club, on the commercial terms set out there.
        Those terms take precedence over this section where they conflict. We do not currently take payment online.
      </LegalP>
      <LegalP>
        When a subscription lapses, access moves to a short read-only grace period and then to lockout. <strong>Ending or pausing a
        subscription does not delete data</strong> — records remain in place and access can be restored. See section 14 and our{" "}
        {PRIVACY}.
      </LegalP>
      <LegalP>
        Daily athlete check-in remains available regardless of subscription status, so that an athlete&rsquo;s own compliance record is
        never interrupted by a commercial dispute they are not party to.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="ip">11. Intellectual property</LegalH2>
      <LegalP>
        The platform, its design, its clinical reference content and the Bridgetx name and branding belong to us or our licensors. You
        get a non-exclusive, non-transferable right to use the platform for its intended purpose while your access is valid.
      </LegalP>
      <LegalP>
        Data you enter remains yours — or your club&rsquo;s. We use it to provide the service, as described in our {PRIVACY}. We may use
        aggregated, anonymised information that does not identify any individual or club to improve the platform.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="availability">12. Availability</LegalH2>
      <LegalP>
        We work to keep Bridgetx available and correct, but we provide it &ldquo;as is&rdquo;. We do not guarantee uninterrupted or
        error-free operation, and we do not currently offer a contractual uptime commitment unless one is written into your club&rsquo;s
        agreement. We depend on third-party infrastructure, and outages there can affect us.
      </LegalP>
      <LegalP>
        We may change, suspend or withdraw features. Where a change materially reduces what you rely on, we will give reasonable notice.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="liability">13. Liability</LegalH2>
      <LegalP>
        Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for anything else that
        cannot lawfully be limited. Nothing here affects the statutory rights of a consumer.
      </LegalP>
      <LegalP>
        Subject to that, and to the extent the law allows: we are not liable for indirect or consequential loss, loss of profit, loss of
        opportunity, or loss of data; and our total liability arising out of the platform in any twelve-month period is limited to the
        fees paid for it in that period.
      </LegalP>
      <LegalP>
        In particular, and given section 6: we are not liable for clinical decisions made by practitioners, or for outcomes arising from
        acting on a report without appropriate professional review.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="termination">14. Suspension, termination and your data</LegalH2>
      <LegalP>
        We may suspend or terminate access if these terms are breached, if there is a security risk, or if fees go unpaid. A club may
        end its subscription in line with its agreement.
      </LegalP>
      <LegalP>
        Termination does not automatically delete data. Athlete records are designed to persist so that an athlete&rsquo;s history
        follows them. If you want data deleted, ask us at {MAIL} — our {PRIVACY} explains how requests are handled, and is candid that
        this is a manual process today.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="law">15. Governing law</LegalH2>
      <LegalP>
        These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction. If you are a
        consumer resident elsewhere, you keep the benefit of any mandatory protections of your local law.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="changes">16. Changes and contact</LegalH2>
      <LegalP>
        We will update these terms as the platform develops. The date at the top shows the last revision, and we will tell affected
        clubs and users about material changes.
      </LegalP>
      <LegalP>
        Questions: {MAIL}, or {COMPANY.name}, {COMPANY.address}.
      </LegalP>
    </LegalShell>
  );
}
