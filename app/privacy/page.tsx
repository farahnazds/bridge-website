import type { Metadata } from "next";
import LegalShell, { LegalH2, LegalH3, LegalP, LegalUL, LegalCallout, LegalTable } from "@/components/legal/LegalShell";
import { COMPANY } from "@/components/SiteFooter";

// ============================================================================
// ⚠️  FIRST DRAFT — NOT LEGALLY REVIEWED. DO NOT RELY ON IN PRODUCTION.
//     See the full banner in components/legal/LegalShell.tsx.
// ============================================================================
// Drafted 2026-08-22 from a direct audit of this repository and the live
// database, NOT from a template. Provenance for the load-bearing claims, so a
// reviewer (or a future maintainer) can re-verify rather than trust:
//
//   Athlete fields ............ database/schema.sql:319-348, docs/10-athlete-data-fields.md
//   Conditions/allergies ...... database/schema.sql:190-206, 361-386
//   Injury clinical notes ..... database/schema.sql (injuries.description), migration 006/018
//   Ethnicity is SENSITIVE .... database/schema.sql:328 (inline comment), docs/05-business-rules.md:178-185
//   What is sent to Claude .... app/staff/[teamId]/reports/*PromptBuilder.ts
//                               (ethnicity: bodyCompositionPromptBuilder.ts:291,
//                                combinedPromptBuilder.ts:129), model lib/anthropic.ts:17
//   Resend recipients ......... lib/resend.ts
//   Fontshare runtime font .... app/layout.tsx:31  <-- a real third-party request
//                               from every visitor's browser; named below
//   No analytics/tracking ..... verified 2026-08-22: no Sentry/PostHog/GA/Vercel
//                               Analytics/ad pixels anywhere in the repo
//   Storage buckets ........... report-pdfs / profile-photos / club-branding, all private
//   No deletion path .......... no .delete() against athletes, profiles, reports,
//                               checkins, assessments, gps_logs, vald_data,
//                               injuries; no .remove() against Storage AT ALL
//   No retention job .......... vercel.json has one cron, compliance-check, which
//                               only WRITES notifications
//   Minors gap ................ docs/09-roadmap.md:33-35 (no individual guardian
//                               consent for club-athlete minors — deferred,
//                               pending legal review)
//   DOB validation ............ app/club/[clubId]/athletes/[athleteId]/actions.ts:141-144
//                               (rejects only future dates and >100y — NO age floor)
//
//   Hosting region ............ CONFIRMED 2026-08-22 in the Supabase dashboard
//                               (Project Settings → Infrastructure): Primary
//                               Database — "Oceania (Sydney)", ap-southeast-2,
//                               t3.nano. Section 8 says "Australia" on that
//                               basis. If the project is ever migrated to
//                               another region, THIS PAGE MUST BE UPDATED —
//                               an incorrect international-transfer disclosure
//                               is a compliance problem in its own right.
// ============================================================================

export const metadata: Metadata = {
  title: "Privacy Policy — Bridgetx",
  description:
    "How The Bridge High Performance Ltd collects, uses, shares and stores personal and health data in the Bridgetx platform.",
};

const UPDATED = "22 AUGUST 2026";

const TOC = [
  { id: "who-we-are", label: "Who we are" },
  { id: "scope", label: "Who this policy covers" },
  { id: "what-we-collect", label: "What we collect" },
  { id: "where-it-comes-from", label: "Where athlete data comes from" },
  { id: "why", label: "Why we process it, and our legal basis" },
  { id: "ai", label: "AI-generated reports" },
  { id: "sharing", label: "Who we share data with" },
  { id: "transfers", label: "Where your data is stored" },
  { id: "children", label: "Children and young athletes" },
  { id: "retention", label: "How long we keep data" },
  { id: "rights", label: "Your rights" },
  { id: "security", label: "How we protect data" },
  { id: "cookies", label: "Cookies" },
  { id: "changes", label: "Changes to this policy" },
  { id: "contact", label: "Contact and complaints" },
];

const MAIL = <a href={`mailto:${COMPANY.contact}`} style={{ color: "var(--brand-blue)" }}>{COMPANY.contact}</a>;

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      subtitle="What Bridgetx collects about athletes and staff, why we hold it, who else can see it, and what you can ask us to do about it."
      updated={UPDATED}
      toc={TOC}
    >
      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="who-we-are">1. Who we are</LegalH2>
      <LegalP>
        Bridgetx is a sports nutrition and performance intelligence platform operated by <strong>{COMPANY.name}</strong>, a company
        registered in England and Wales under company number {COMPANY.number}, with its registered office at {COMPANY.address}.
      </LegalP>
      <LegalP>
        In this policy, &ldquo;we&rdquo;, &ldquo;us&rdquo; and &ldquo;Bridgetx&rdquo; mean {COMPANY.name}. For anything to do with privacy or
        your data, contact us at {MAIL}.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="scope">2. Who this policy covers</LegalH2>
      <LegalP>This policy applies to four groups of people:</LegalP>
      <LegalUL>
        <li><strong>Athletes</strong> whose data is held in Bridgetx — whether added by a club, working with an independent practitioner, or signed up directly.</li>
        <li><strong>Club staff and practitioners</strong> — managers, coaches, nutritionists, physiotherapists and doctors who use the platform.</li>
        <li><strong>Prospective customers</strong> who fill in our &ldquo;Book a Meeting&rdquo; form.</li>
        <li><strong>Visitors</strong> to bridgetx.co.</li>
      </LegalUL>
      <LegalCallout title="An important distinction">
        <p style={{ margin: 0 }}>
          Where an athlete belongs to a club, <strong>the club decides</strong> what data is collected about that athlete and who at the club
          can see it. In data protection terms the club is generally the <em>controller</em> and Bridgetx acts as a <em>processor</em> on its
          instructions. If you are a club athlete and you want data corrected or removed, your club is usually the right first
          contact — but you can always come to us at {MAIL} and we will help.
        </p>
      </LegalCallout>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="what-we-collect">3. What we collect</LegalH2>

      <LegalH3>Athletes</LegalH3>
      <LegalP>
        Bridgetx is a clinical performance tool, so the athlete record is detailed. Depending on what a club or practitioner chooses
        to record, it can include:
      </LegalP>
      <LegalUL>
        <li><strong>Identity and profile</strong> — name, athlete code, country, date of birth, gender, sport, position, tier, and a profile photo.</li>
        <li><strong>Ethnicity</strong> — recorded because it can affect nutrition and supplement guidance. This is sensitive data and we treat it as such; see section 5.</li>
        <li><strong>Health and clinical information</strong> — medical conditions (for example asthma, diabetes, cardiac conditions, anaemia, coeliac disease, epilepsy, sickle cell, a history of disordered eating), allergies, intolerances, and dietary or religious dietary preference.</li>
        <li><strong>Injury records</strong> — injury type, clinical description, status, return-to-play phase and target return date.</li>
        <li><strong>Body composition and physiology</strong> — height, weight, body fat percentage, lean and muscle mass, visceral fat, and estimated BMR/TDEE, recorded through assessments such as Tanita, InBody, DEXA or skinfold.</li>
        <li><strong>Menstrual and iron status</strong>, including cycle length, period duration and the start date of the last period, for female athletes.</li>
        <li><strong>Training and performance data</strong> — session distance, speed, sprint and acceleration counts, player load and session duration; and force-plate test results such as counter-movement jump and asymmetry percentages.</li>
        <li><strong>Daily check-ins</strong> — self-reported nutrition, hydration, energy and sleep ratings, supplements taken, and free-text notes.</li>
        <li><strong>Supplement prescriptions</strong> — what was prescribed, the dose, the timing and the dates it applied.</li>
        <li><strong>Practitioner notes and comments</strong> about the athlete, including private staff notes.</li>
        <li><strong>Messages</strong> exchanged between athletes and practitioners inside the platform.</li>
        <li><strong>Reports</strong> generated about the athlete, stored as PDFs.</li>
        <li><strong>Relationship history</strong> — which club, team and practitioner the athlete has been under, and when.</li>
      </LegalUL>
      <LegalCallout title="What we do not collect">
        <p style={{ margin: 0 }}>
          We do <strong>not</strong> collect identity documents such as passports or national ID. We do <strong>not</strong> collect
          geographic location. Our &ldquo;GPS&rdquo; data is athletic performance telemetry from training sessions — distance, velocity,
          player load — and does not record where an athlete is or has been. We do <strong>not</strong> use advertising trackers,
          analytics pixels, or any third-party behavioural tracking on this site.
        </p>
      </LegalCallout>

      <LegalH3>Club staff and practitioners</LegalH3>
      <LegalP>
        Name, email address, role, professional specialty and department, a display title, an optional avatar, and a record of which
        club or team you last opened so that signing in returns you to where you work.
      </LegalP>

      <LegalH3>Prospective customers</LegalH3>
      <LegalP>
        If you use our &ldquo;Book a Meeting&rdquo; form we collect your name, club name, email address, phone number, role, country,
        sport, approximate squad size, and any meeting time you request.
      </LegalP>

      <LegalH3>Technical data</LegalH3>
      <LegalP>
        Our hosting and infrastructure providers process standard technical information needed to serve the site securely, such as IP
        address, browser type and request logs. We do not combine this with athlete records to profile anyone.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="where-it-comes-from">4. Where athlete data comes from</LegalH2>
      <LegalP>
        Most athlete data is <strong>not entered by the athlete</strong>. Club staff and practitioners create athlete records and enter
        assessments, injuries, performance data and prescriptions. Athletes typically enter their own daily check-ins, and in some
        cases a practitioner enters those on their behalf.
      </LegalP>
      <LegalP>
        Every data point carries a record of who provided it and whether it is club-verified, practitioner-verified or self-reported,
        so the origin of a figure is always traceable.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="why">5. Why we process it, and our legal basis</LegalH2>
      <LegalTable
        head={["What we do", "Why", "Legal basis (UK GDPR)"]}
        rows={[
          ["Run athlete profiles, assessments and reporting", "To deliver the platform the club or practitioner has contracted for", "Contract; legitimate interests"],
          ["Process health data — conditions, allergies, injuries, body composition, menstrual and iron status", "To give safe, individualised nutrition and supplement guidance, and to avoid prescribing something contraindicated", "Explicit consent, and/or Article 9(2)(h) health-care purposes — to be confirmed on review"],
          ["Process ethnicity", "Certain nutrition and supplement guidance (for example vitamin D) varies by ethnicity", "Explicit consent — see the note below"],
          ["Generate AI reports", "To produce nutrition, body-composition, compliance and injury reports", "Contract; legitimate interests"],
          ["Send transactional email", "Activation links, report-shared notifications, compliance alerts", "Contract; legitimate interests"],
          ["Respond to booking enquiries", "To arrange a meeting you asked for", "Legitimate interests; steps prior to a contract"],
          ["Keep the service secure", "To protect accounts and data", "Legitimate interests; legal obligation"],
        ]}
      />
      <LegalCallout tone="warn" title="Ethnicity — being straight with you">
        <p style={{ margin: 0 }}>
          Ethnicity is a special category of personal data requiring its own legal basis, over and above ordinary health data. Our
          internal documentation has flagged this field as needing legal sign-off before it drives supplement dosing for real athletes,
          and <strong>that sign-off has not yet happened.</strong> Ethnicity is optional — the field includes a &ldquo;Prefer not to
          say&rdquo; option — and if you would like it removed from your record, email {MAIL} and we will remove it.
        </p>
      </LegalCallout>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="ai">6. AI-generated reports</LegalH2>
      <LegalP>
        Bridgetx uses <strong>Anthropic&rsquo;s Claude API</strong> to draft nutrition, body-composition, compliance and injury reports.
        When a practitioner generates a report, we send that athlete&rsquo;s relevant record to Anthropic for processing. That can
        include their name, date of birth, gender, ethnicity, sport and position, dietary preference, medical conditions, allergies and
        intolerances, body-composition assessments, training and performance data, injury records including the clinical description,
        daily check-ins, and practitioner comments.
      </LegalP>
      <LegalP>
        We use Anthropic&rsquo;s commercial API. Anthropic acts as our processor and, under its commercial terms, does not use data
        submitted through the API to train its models.
      </LegalP>
      <LegalCallout tone="warn" title="AI output is a draft, not a diagnosis">
        <p style={{ margin: 0 }}>
          Reports are generated by a language model and are intended to be reviewed by a qualified practitioner before being acted on.
          They are not medical advice, not a diagnosis, and not a substitute for professional clinical judgement. See our{" "}
          <a href="/terms" style={{ color: "var(--brand-blue)" }}>Terms of Service</a>.
        </p>
      </LegalCallout>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="sharing">7. Who we share data with</LegalH2>
      <LegalP>
        We do not sell personal data, and we do not share it for advertising. We share it with the following service providers, who
        process it on our instructions:
      </LegalP>
      <LegalTable
        head={["Provider", "What it does", "What it receives"]}
        rows={[
          [<>Supabase</>, "Database, authentication and file storage — the core of the platform", "All platform data, including athlete health records, report PDFs and profile photos"],
          [<>Vercel</>, "Website and application hosting", "Technical request data; application traffic"],
          [<>Anthropic</>, "AI report generation (Claude API)", "The athlete record sent for a given report — see section 6"],
          [<>Resend</>, "Transactional email delivery", "Recipient name and email address, and the content of the notification (for example athlete name, club and team, report type)"],
          [<>Fontshare (Indian Type Foundry)</>, "Serves one of our brand fonts to your browser", "Your IP address and browser details, when you load a page"],
        ]}
      />
      <LegalP>
        Within the platform, athlete data is visible to the staff at that athlete&rsquo;s club whose role permits it, and to any
        independent practitioner the athlete works with. Access is enforced at the database level, not merely hidden in the interface.
        Some clinical detail — for example the full description of an injury — is deliberately restricted from athletes themselves and
        visible only to appropriate staff.
      </LegalP>
      <LegalP>
        We may also disclose data if required by law, or to establish, exercise or defend legal claims.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="transfers">8. Where your data is stored</LegalH2>
      <LegalP>
        We are a UK company, and many of our clients are outside the UK — the current pilot is in the United Arab Emirates. Your data
        therefore crosses borders.
      </LegalP>
      <LegalUL>
        <li>Our <strong>database and file storage</strong> are hosted with Supabase in <strong>Australia</strong>.</li>
        <li>Our <strong>hosting</strong> (Vercel), <strong>AI processing</strong> (Anthropic) and <strong>email delivery</strong> (Resend) are provided by companies based in the <strong>United States</strong>, and process data there.</li>
      </LegalUL>
      <LegalP>
        Where we transfer personal data out of the UK, we rely on the safeguards our providers offer for international transfers,
        including the UK International Data Transfer Addendum and the EU Standard Contractual Clauses. You can ask us for details of
        the safeguards that apply by emailing {MAIL}.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="children">9. Children and young athletes</LegalH2>
      <LegalP>
        Bridgetx is built for sports clubs and academies, and academy squads routinely include athletes under 18. The platform supports
        youth age groups, and we expect to hold data about minors.
      </LegalP>
      <LegalCallout tone="warn" title="How consent works today — and where it is thin">
        <p style={{ margin: 0 }}>
          We want to describe this plainly rather than imply protections we have not built yet.
        </p>
        <p style={{ margin: 0 }}>
          Athlete accounts are created <strong>by club staff</strong>, not by athletes signing themselves up. Where an athlete is a
          minor, we currently rely on <strong>the club&rsquo;s own consent and safeguarding arrangements with the athlete and their
          parents or guardians</strong> — the same arrangements under which the club already holds medical and performance information
          about that player. Bridgetx does <strong>not</strong> separately collect individual parental or guardian consent, and the
          platform does <strong>not</strong> currently record guardian details or enforce a minimum age at sign-up.
        </p>
        <p style={{ margin: 0 }}>
          We have identified this as a gap. Introducing verifiable guardian consent, and reviewing whether club-mediated consent is
          sufficient, is an open item that we are addressing with legal advice before the platform scales beyond its current pilot.
        </p>
        <p style={{ margin: 0 }}>
          If you are a parent or guardian of an athlete on Bridgetx and you want to know what we hold, object to it, or have it removed,
          email {MAIL} and we will deal with it directly.
        </p>
      </LegalCallout>
      <LegalP>
        Clubs and practitioners using Bridgetx are responsible for ensuring they have a proper basis to record a young athlete&rsquo;s
        health information and to enter it into the platform.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="retention">10. How long we keep data</LegalH2>
      <LegalCallout tone="warn" title="Currently: indefinitely">
        <p style={{ margin: 0 }}>
          Bridgetx is deliberately built so that an athlete&rsquo;s history is permanent and travels with them between clubs,
          practitioners and seasons. A body-composition trend or a compliance record is only meaningful over years, and an athlete who
          leaves a club keeps their history.
        </p>
        <p style={{ margin: 0 }}>
          The practical consequence, stated honestly: <strong>we do not currently delete athlete data automatically, and we have no
          automated retention or purge schedule.</strong> Removing an athlete from a team or a club does not delete their record.
          Ending a club subscription does not delete anything. Records including check-ins, assessments, prescriptions and relationship
          history are designed never to be deleted, and report PDFs and profile photos are retained in storage.
        </p>
        <p style={{ margin: 0 }}>
          We recognise that &ldquo;indefinitely&rdquo; is not an adequate retention position under UK data protection law. Defining
          proper retention periods, and building the mechanism to enforce them, is active work. In the meantime, we will delete data on
          request — see section 11.
        </p>
      </LegalCallout>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="rights">11. Your rights</LegalH2>
      <LegalP>If you are in the UK or the EU, you have the right to:</LegalP>
      <LegalUL>
        <li>ask what personal data we hold about you, and get a copy of it;</li>
        <li>have inaccurate data corrected;</li>
        <li>ask us to delete your data;</li>
        <li>ask us to restrict or object to how we use it;</li>
        <li>ask for your data in a portable format;</li>
        <li>withdraw consent at any time, where we rely on consent;</li>
        <li>complain to a data protection regulator.</li>
      </LegalUL>
      <LegalP>
        People outside the UK and EU have comparable rights under their own local law — including, for our UAE clients, the UAE Personal
        Data Protection Law — and we will honour requests from any user on the same basis.
      </LegalP>
      <LegalCallout title="How to exercise them — and how it works in practice">
        <p style={{ margin: 0 }}>
          Email {MAIL} with what you want. We will respond within one month, as UK GDPR requires, and will tell you if we need longer for
          a complex request.
        </p>
        <p style={{ margin: 0 }}>
          Being transparent about the mechanism: <strong>Bridgetx does not currently offer a self-service way to download or delete your
          data from within the app.</strong> Requests are handled manually by our team. This is a limitation of the product today, not a
          reason for us to decline a request, and building self-service access and deletion is on our roadmap.
        </p>
        <p style={{ margin: 0 }}>
          If you are a club athlete, we may need to consult your club before deleting records the club holds as controller — for example
          where it has its own medical-record retention obligations. We will tell you if that applies.
        </p>
      </LegalCallout>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="security">12. How we protect data</LegalH2>
      <LegalUL>
        <li><strong>Access control at the database level.</strong> Every table enforces row-level security, so who can see which athlete is decided by the database itself, not by the user interface. Hiding a button is not our security model.</li>
        <li><strong>Private file storage.</strong> Report PDFs, profile photos and club branding are held in private buckets and served only through short-lived signed links.</li>
        <li><strong>Structural restriction of clinical detail.</strong> Sensitive fields such as full injury descriptions are restricted through dedicated database views rather than by convention.</li>
        <li><strong>Encryption in transit</strong> across the platform, and encryption at rest by our infrastructure providers.</li>
        <li><strong>Scoped credentials.</strong> Keys for AI, email and privileged database access are held server-side and are never exposed to the browser.</li>
      </LegalUL>
      <LegalP>
        No system is perfectly secure. If you believe your account or data has been compromised, contact {MAIL} immediately.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="cookies">13. Cookies</LegalH2>
      <LegalP>
        We use cookies only to keep you signed in and to keep your session secure. We do not use advertising cookies, analytics
        cookies, or third-party tracking of any kind, which is why you are not seeing a cookie consent banner. The one third party your
        browser contacts when loading our pages is our font provider, listed in section 7.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="changes">14. Changes to this policy</LegalH2>
      <LegalP>
        We will update this policy as the platform changes — in particular when we introduce a defined retention schedule, self-service
        data access and deletion, and a settled approach to guardian consent. The date at the top of this page shows when it was last
        revised. Where a change materially affects you, we will tell the clubs and users concerned.
      </LegalP>

      {/* ---------------------------------------------------------------- */}
      <LegalH2 id="contact">15. Contact and complaints</LegalH2>
      <LegalP>
        For any privacy question or request, contact {MAIL}, or write to {COMPANY.name}, {COMPANY.address}.
      </LegalP>
      <LegalP>
        If you are unhappy with how we have handled your data, you can complain to the UK Information Commissioner&rsquo;s Office at
        ico.org.uk, or to the data protection authority in your own country. We would rather you raised it with us first so we can put it
        right.
      </LegalP>
    </LegalShell>
  );
}
