import type { Metadata } from "next";
import { A, B, Bullets, P } from "@/components/docs/blocks";
import { LegalPage, Section } from "@/components/legal/legal-page";
import { CONTACT_EMAIL } from "@/content/legal";

export const metadata: Metadata = {
  title: "Terms of service: Centrale",
  description: "The terms for using Centrale to find investors, write to them and run your raise.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" lead="The agreement between you and Centrale when you create an account and use the service.">
      <Section id="service" title="1. What Centrale is">
        <P>
          Centrale helps founders raise money. It builds a startup profile from your website, gives you an investor database to search, matches you with
          investors at your round, drafts emails with AI for you to review, sends them from an inbox set up for you, and tracks replies and your
          pipeline. It can also draft a pitch deck. Centrale is a tool: it does not raise money for you, give investment or legal advice, or guarantee
          that any investor will reply or invest.
        </P>
      </Section>

      <Section id="account" title="2. Your account">
        <Bullets
          items={[
            "You must be at least 18 and able to agree to these terms for yourself or for the company you represent.",
            "Use an email address you control and keep your password private. You are responsible for what happens in your account.",
            "One person per account. Do not open accounts to get extra trials, credits or sending capacity.",
            "Tell us straight away if you think someone else has used your account.",
          ]}
        />
      </Section>

      <Section id="trial-billing" title="3. Trial, billing and cancelling">
        <Bullets
          items={[
            "Plans start with a 7-day free trial. Payment is handled by Whop, which asks for a card at checkout. Nothing is charged during the trial.",
            "After the trial your plan renews every month at the price shown at checkout and on the Billing page, until you cancel.",
            "Cancel at any time from Billing. If you cancel during the trial you are not charged. If you cancel later, your plan runs to the end of the period you have paid for and does not renew.",
            "Sending emails, full contact details and exports start when your paid plan starts, not during the trial.",
            "Plan limits (reveals, exports, deck generations, search depth) are listed in the docs and reset each billing period. Unused amounts do not roll over.",
            "We may change prices. We will tell you at least 30 days before a change affects your next renewal, and you can cancel before it does.",
          ]}
        />
        <P>
          Fees are not refundable except where the law requires it, or where we decide to refund because something went wrong on our side.
        </P>
      </Section>

      <Section id="sending" title="4. Sending emails through Centrale">
        <P>
          You decide who to email and what to send. Every email goes out from your inbox and in your name, so you are responsible for it. When you send
          through Centrale you agree to:
        </P>
        <Bullets
          items={[
            "write only to investors about your raise or business, in a way a professional investor would reasonably expect;",
            "tell the truth about yourself, your company and your numbers, and never pretend to be someone else;",
            "read every draft before you queue it. Drafts are written by AI and can be wrong;",
            "follow the email and data protection laws that apply to you and to the people you write to, such as UK and EU GDPR, PECR and CAN-SPAM;",
            "never send spam, harassment, phishing, malware or anything illegal or deceptive.",
          ]}
        />
        <P>
          Every first email and follow-up includes an unsubscribe link. Anyone who unsubscribes, bounces, reports spam or asks to be removed is never
          emailed through Centrale again, by you or anyone else. Daily sending limits apply to protect deliverability, and emails over a limit wait
          until the next day. We may pause sending on an account that breaks these rules or harms deliverability for others, and we will tell you when we
          do.
        </P>
      </Section>

      <Section id="investor-data" title="5. Investor data">
        <P>
          The investor database is licensed to you for your own fundraising while your plan is active. You may search it, reveal and export contact
          details within your plan limits, and contact investors about your raise. You may not:
        </P>
        <Bullets
          items={[
            "sell, share, publish or give the data to anyone else, or use it to build another database or service;",
            "copy the database in bulk, or use bots or scripts to read it outside the product;",
            "use it for anything other than raising money for your own company.",
          ]}
        />
        <P>
          Investor details come from business sources and can be out of date or wrong. We do not promise they are complete or accurate. Investors can
          remove themselves at any time at <A href="/remove">centralegtm.com/remove</A>, and they then disappear from your searches and saved lists.
        </P>
      </Section>

      <Section id="your-content" title="6. Your content">
        <P>
          You keep ownership of everything you give us or create in Centrale: your profile, your deck, your emails and your notes. You give us
          permission to store and process it only to run the service for you, for example to match investors, draft emails, send them and generate
          your deck. We do not sell your content or use it to train AI models. AI-generated drafts and decks are yours to use once created, but check
          them before you rely on them: AI can make mistakes, and figures in a generated deck should be confirmed against their sources.
        </P>
      </Section>

      <Section id="acceptable-use" title="7. Things you must not do">
        <Bullets
          items={[
            "break the law, or help anyone else to;",
            "try to get around plan limits, sending limits, rate limits or security;",
            "probe, scan or attack the service, or interfere with other users;",
            "reverse engineer the service except where the law allows it;",
            "upload anything you do not have the right to share.",
          ]}
        />
      </Section>

      <Section id="suspension" title="8. Suspension and closing your account">
        <P>
          You can delete your account at any time from Settings. This removes your profile, inbox, decks and outreach history; cancel a renewing plan in
          Billing first. We may suspend or close an account that breaks these terms, puts other users or recipients at risk, or does not pay. Where we
          can, we will warn you first and give you a chance to fix the problem.
        </P>
      </Section>

      <Section id="liability" title="9. Our responsibility to you">
        <P>
          We work to keep Centrale running and secure, but it is provided as it is, without promises that it will always be available, error free, or
          that it will achieve any particular result. To the extent the law allows, we are not responsible for lost profits, lost funding, lost data or
          indirect losses, and our total responsibility for any claim is limited to the fees you paid us in the 12 months before the claim. Nothing in
          these terms limits responsibility that cannot be limited by law, such as for fraud, or for death or personal injury caused by negligence.
        </P>
        <P>
          You are responsible for claims that arise from emails you send or content you upload, and you agree to cover our reasonable costs if a claim
          is brought against us because of them.
        </P>
      </Section>

      <Section id="changes" title="10. Changes to the service and these terms">
        <P>
          We improve Centrale often, and features may change. If we change these terms in a way that matters, we will tell you by email or in the app
          before the change takes effect. If you keep using Centrale after that, the new terms apply; if you do not agree, you can cancel and delete your
          account.
        </P>
      </Section>

      <Section id="contact" title="11. Contact">
        <P>
          Questions about these terms: <B>{CONTACT_EMAIL}</B>. How we handle personal data is set out in our <A href="/privacy">privacy policy</A>.
        </P>
      </Section>
    </LegalPage>
  );
}
