import type { Metadata } from "next";
import { A, B, Bullets, P, Table } from "@/components/docs/blocks";
import { LegalPage, Section } from "@/components/legal/legal-page";
import { CONTACT_EMAIL } from "@/content/legal";

export const metadata: Metadata = {
  title: "Privacy policy: Centrale",
  description: "What personal data Centrale holds about founders and investors, why, who processes it and how to remove it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      lead="What we collect, why, who helps us process it, how long we keep it, and how to see, change or remove it. It covers founders who use Centrale and investors listed in our directory."
    >
      <Section id="who" title="1. Who we are">
        <P>
          Centrale is a fundraising tool for startup founders, at centralegtm.com. For founders&apos; account data and for the investor directory, Centrale
          is the controller. For emails a founder writes and sends through Centrale, the founder decides who to contact and what to say, and we
          process those emails on their behalf. Contact us at <B>{CONTACT_EMAIL}</B> about anything in this policy.
        </P>
      </Section>

      <Section id="founders" title="2. If you use Centrale">
        <Table
          head={["What", "Why we use it"]}
          rows={[
            ["Your name, login email and password (stored only as a secure hash)", "To run your account and sign you in"],
            ["Your website, and the profile we write from it", "To describe your startup, match investors and draft emails"],
            ["Your answers in onboarding: round, revenue, team size, values", "To match investors at your round and in your sectors"],
            ["Your pitch deck, uploaded or generated, and your brand colours and logo", "To build and store your deck"],
            ["Emails you send and receive, notes and pipeline stages", "To send your outreach, show replies and track your raise"],
            ["Your booking link, if you add one", "To include it in drafts and count clicks on it"],
            ["Usage and cost records, and a scrambled (hashed) copy of the network you signed up from", "To keep the service working, set limits and stop abuse"],
            ["Your plan and payment status from Whop", "To give you the right plan. Whop holds your card details; we never see them"],
          ]}
        />
        <P>
          We rely on our contract with you to run the service, and on our legitimate interest in keeping it secure and working. We do not sell your
          data, use it for advertising, or use it to train AI models.
        </P>
      </Section>

      <Section id="investors" title="3. If you are an investor in our directory">
        <P>
          Our directory lists people who invest in startups, such as partners, angels, principals and associates at venture firms, angel groups,
          accelerators and family offices. For each person it holds professional details: name, job title, firm, firm website and description, the
          stages and sectors the firm invests in, location, work email, and where available phone and LinkedIn profile. These come from business data
          sources and public professional profiles.
        </P>
        <P>
          We use them so founders can find investors whose focus fits their startup and contact them about their raise. We rely on legitimate interest:
          investors generally want to hear about relevant companies, and we limit use to that purpose. Contact details are hidden from founders until
          they are on a paid plan, and search limits stop the directory being copied in bulk.
        </P>
        <Bullets
          items={[
            <>
              <B>Stop all emails sent through Centrale:</B> use the unsubscribe link at the bottom of any email you received. It applies to every
              founder, not just the one who wrote to you.
            </>,
            <>
              <B>Leave the directory entirely:</B> go to <A href="/remove">centralegtm.com/remove</A>, enter your email and confirm from the link we send
              you. You stop appearing in searches and founders can no longer email you through Centrale.
            </>,
            <>
              <B>See, correct or erase what we hold about you:</B> write to <B>{CONTACT_EMAIL}</B>.
            </>,
          ]}
        />
        <P>
          We keep your address on a do-not-email list after you unsubscribe or ask to be removed. That is the only way to make sure you are not
          contacted again.
        </P>
      </Section>

      <Section id="processors" title="4. Who helps us run Centrale">
        <P>We use these providers to run the service. Each only processes data to provide their service to us.</P>
        <Table
          head={["Provider", "What they do", "Data they handle"]}
          rows={[
            ["Supabase", "Database, sign-in, file storage and background jobs, hosted in the EU (Frankfurt)", "Everything stored in Centrale"],
            ["Vercel", "Hosts the website", "Pages you load and the requests your browser makes"],
            ["OpenMail", "Sending inboxes, sending and receiving email", "Your emails, recipients and replies"],
            ["Anthropic (Claude)", "Writes profiles, email drafts, decks and AI search filters", "Your profile and the investor details a draft is about"],
            ["Firecrawl", "Reads your website during onboarding and for your deck", "Your website's public pages"],
            ["Whop", "Checkout, subscriptions and billing", "Your payment details and plan"],
          ]}
        />
        <P>
          Some of these providers are based in or process data in the United States. Where data leaves the UK or EU, we rely on the safeguards the law
          provides for that, such as standard contractual clauses or adequacy decisions.
        </P>
      </Section>

      <Section id="retention" title="5. How long we keep it">
        <Table
          head={["Data", "Kept for"]}
          rows={[
            ["Your account, profile, deck, emails and pipeline", "Until you delete your account in Settings"],
            ["Usage cost records", "Kept after you delete your account, without anything that identifies you"],
            ["Hashed signup network records", "30 days"],
            ["Error records from our systems", "14 days"],
            ["Do-not-email list (unsubscribes, bounces, removals)", "For as long as we run the service, so opt-outs keep working"],
            ["Investor directory entries", "Until the investor asks to be removed or the entry is replaced in an update"],
          ]}
        />
        <P>Backups held by our database provider may keep deleted data for a short time before they expire.</P>
      </Section>

      <Section id="rights" title="6. Your rights">
        <P>Depending on where you live, you can ask us to:</P>
        <Bullets
          items={[
            "give you a copy of the personal data we hold about you;",
            "correct anything that is wrong;",
            "delete it. Founders can do this themselves from Settings; investors can use the removal page;",
            "stop or limit how we use it, or object to our use of it;",
            "move it to another service in a common format.",
          ]}
        />
        <P>
          Write to <B>{CONTACT_EMAIL}</B> and we will reply within one month. If you are not happy with our answer you can complain to your data
          protection authority, for example the Information Commissioner&apos;s Office in the UK.
        </P>
      </Section>

      <Section id="cookies" title="7. Cookies">
        <P>
          We only use cookies that are needed for the service to work: the ones that keep you signed in. We do not use advertising or analytics
          cookies. Your browser may also store small settings, such as your last search, on your own device.
        </P>
      </Section>

      <Section id="security" title="8. Security">
        <P>
          Data is encrypted in transit, access to it is limited by account, contact details are hidden until a plan allows them, deck download links
          expire after a minute, and our backend only accepts requests from our own site. No system is perfectly secure; if a breach affects you we will
          tell you and the authorities as the law requires.
        </P>
      </Section>

      <Section id="changes" title="9. Changes">
        <P>
          If we change this policy in a way that matters, we will update the date at the top and tell founders by email or in the app. The{" "}
          <A href="/terms">terms of service</A> cover the rest of our agreement with founders.
        </P>
      </Section>
    </LegalPage>
  );
}
