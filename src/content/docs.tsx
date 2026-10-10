// KEEP THIS FILE IN STEP WITH THE PRODUCT. Whenever product behaviour changes (limits, prices shown,
// flows, statuses, button names, what the trial includes), update the matching section here in the
// same change, and add a line to "What's new". The /dashboard/docs page renders only from this file.
//
// Copy voice: sentence case, plain literal sentences, no em or en dashes, no exclamation marks, no
// emoji, never "unlock", "leverage", "seamless", "revolutionary" or "game-changing". Address the
// founder as "you" and prefer concrete numbers.
import type { ReactNode } from "react";
import { A, B, Bullets, Callout, Changelog, Code, Faq, Figures, H3, P, Steps, Table } from "@/components/docs/blocks";

export interface DocSection {
  /** Anchor id: /dashboard/docs#<id>. Changing one breaks links people have shared. */
  id: string;
  title: string;
  /** One line under the title, also shown in search results. */
  summary: string;
  body: ReactNode;
}

/** Shown at the top of the page. Change it whenever this file changes. */
export const DOCS_UPDATED = "2026-10-09";

export const DOCS: DocSection[] = [
  {
    id: "overview",
    title: "Overview",
    summary: "What Centrale does, from finding investors to tracking their replies.",
    body: (
      <>
        <P>
          Centrale helps you raise from investors who fit your startup. It finds them, writes to them from your own inbox with Claude drafting each
          email, follows up when they go quiet, shows you who replied and builds a pitch deck you can send.
        </P>
        <Steps
          items={[
            { title: "Tell us your website", body: "We read your homepage and Claude writes your startup profile. You check it and correct anything that is off." },
            { title: "Find investors who fit", body: "Search the investor database, filter it, and sort by a fit score from 0 to 100. Claude also shortlists 25 picks for you." },
            { title: "Write from your own inbox", body: "Choose investors, Claude drafts a first email to each one, you edit anything you like and queue them. They send from your address." },
            { title: "Follow up automatically", body: "If an investor has not replied after the number of days you choose, one short follow-up goes in the same thread." },
            { title: "Track replies", body: "Replies arrive in Inbox, the investor is marked as replied, and we email you a heads-up." },
            { title: "Make a pitch deck", body: "Answer five questions and Centrale writes a branded, sourced deck you can download as a PDF." },
          ]}
        />
        <Figures
          items={[
            { value: "7 days", label: "Free trial, card up front" },
            { value: "0 to 100", label: "Fit score for every investor" },
            { value: "25", label: "Claude picks shortlisted for you" },
            { value: "20", label: "New emails a day per inbox" },
          ]}
        />
      </>
    ),
  },

  {
    id: "getting-started",
    title: "Getting started and your trial",
    summary: "Your account, the 7-day trial, and what starts when your plan starts.",
    body: (
      <>
        <P>
          You create an account with your email, then start a 7-day free trial through Whop checkout. Whop asks for a card up front. Nothing is
          charged today. After day 7 the plan is billed monthly. The current price is shown on the <A href="/dashboard/billing">Billing</A> page.
        </P>
        <Callout tone="tip" title="Cancel any time before day 7">
          Go to Billing, press <B>Manage subscription</B> and cancel there. You are not charged if you cancel before the trial ends.
        </Callout>
        <H3>What you get during the trial</H3>
        <Bullets
          items={[
            "Your startup profile, built from your website.",
            <>Your own sending inbox, created during onboarding on an <Code>@omail.sh</Code> address.</>,
            <>The <A href="/dashboard/docs#custom-domain">custom domain</A> setup, so your address is ready when sending starts.</>,
            "Your pitch deck, with up to 3 deck generations.",
            <>
              The investor database with contact details truncated, for example <Code>j•••@firm.com</Code> and <Code>+1 201-•••-••••</Code>.
            </>,
            "Up to 500 investor rows, which is about 10 pages.",
            "Claude picks, your shortlist of 25 investors.",
            "Claude drafts of first emails, so you can read them before your plan starts.",
          ]}
        />
        <H3>What starts when your plan starts</H3>
        <Bullets
          items={[
            "Sending emails from your inbox.",
            "Automatic follow-ups.",
            "Revealing full contact details, 2,500 a month.",
            "Exports, 2,500 export credits a month.",
            "The full investor database with no row limit.",
          ]}
        />
        <P>
          Emails you queue during the trial wait in the Outbox and send once your plan starts. See <A href="/dashboard/docs#plans-and-limits">Plans and
          limits</A> for every number side by side.
        </P>
      </>
    ),
  },

  {
    id: "onboarding",
    title: "Onboarding",
    summary: "From your domain to a written profile, a working inbox and matched investors.",
    body: (
      <>
        <P>Onboarding takes a few minutes. You answer short questions on the left while your worksheet fills in on the right.</P>
        <Steps
          items={[
            { title: "Enter your domain", body: <>For example <Code>yourcompany.com</Code>. Your name and company name come first, because investors see them on every email.</> },
            {
              title: "We read your homepage",
              body: "One scrape of your homepage gives us the words on it and your brand: colours, fonts, logo, favicon and a screenshot of the page. The brand is used to style your pitch deck.",
            },
            { title: "You answer a few questions", body: "Team size, any values you stand for, the round you are raising, the investors you want to hear from, your monthly revenue, and an optional pitch deck upload." },
            { title: "Claude writes your profile", body: "A one-liner, a summary, your mission, what this raise is for, your sectors and the keywords investors will match on." },
            { title: "You review the answers", body: "Read it through and edit anything that is wrong. You can change all of it later on the Startup profile page." },
            { title: "We set up your inbox", body: <>Your sending inbox is created on an <Code>@omail.sh</Code> address. You can move it to your own domain later.</> },
            { title: "We match investors and can draft your deck", body: "Claude picks your first 25 investors, and if you asked for one, Centrale starts on your pitch deck." },
          ]}
        />
        <Callout title="If you upload a deck">
          An uploaded PDF becomes the source of truth for your profile, ahead of your website. Uploads can be PDF, PPTX, PPT, KEY or DOCX, up to 50 MB.
        </Callout>
      </>
    ),
  },

  {
    id: "startup-profile",
    title: "Startup profile",
    summary: "The fields Claude and the fit score read, and how to edit them.",
    body: (
      <>
        <P>
          Your startup profile is what Centrale knows about you. The fit score reads it to rank investors, Claude picks reads it to shortlist them, and
          Claude reads it again every time it drafts an email or a deck. A better profile gives better matches and better emails.
        </P>
        <Table
          head={["Field", "What it is for"]}
          rows={[
            ["One-liner", "One sentence on what you do and for whom. Opens most first emails."],
            ["Who you are", "Three or four sentences: who you are, what you sell, how it works and who buys it."],
            ["Mission", "One sentence, in your own terms where possible."],
            ["What this raise is for", "What the money funds and the next milestone."],
            ["Keywords investors will match on", "Terms written from your website. Claude picks match keywords from these and your profile."],
            ["Company name, headquarters, team size", "Your country counts toward the fit score."],
            ["Sectors", "Up to 25 fit points when an investor lists the same sector."],
            ["Values", "Some investors only back companies with these values. Worth 5 fit points."],
            ["Round", "The stage you are raising. Worth 15 fit points when it matches."],
            ["Raising and monthly revenue", "Used in drafts and in your deck."],
            ["Investor types", "Who you want to hear from. Worth 10 fit points when it matches, 5 if you leave it empty."],
            ["Traction", "One fact per line. Claude uses these in first emails and follow-ups."],
            ["Pitch deck", "An uploaded file, PDF, PPTX, PPT, KEY or DOCX, up to 50 MB."],
          ]}
        />
        <H3>Editing it later</H3>
        <P>
          Open <A href="/dashboard/profile">Startup profile</A>, change any field and press <B>Save changes</B>. Fit scores update straight away. Press{" "}
          <B>Rewrite from website</B> to have Claude redraft the summary, mission and goal from your website and deck; it replaces those three fields, so save
          your own edits first.
        </P>
        <Callout tone="tip">
          Claude picks are not rerun on every save. After a big change, such as a new round or a new sector, press <B>Refresh Claude picks</B> on the
          Investors page.
        </Callout>
      </>
    ),
  },

  {
    id: "investor-database",
    title: "Investor database",
    summary: "Where the data comes from, search, filters, AI search, saved searches, sorting and pages.",
    body: (
      <>
        <H3>Where the data comes from</H3>
        <P>
          The database holds about 335,000 investors: partners, angels, principals and associates at venture firms, angel groups, accelerators, family
          offices and private equity firms worldwide. Each one has an email address, a LinkedIn profile, or both. For each investor you see their job
          title, firm, firm industry, firm size, the year the firm was founded, location, the stages and sectors the firm is tagged with, the firm&apos;s
          specialties and its own description.
        </P>
        <P>
          About 4 in 10 investors have an email address on file. Add the <B>Email: Has email</B> filter to see only investors you can write to; investors
          without one can still be saved, and the Email button is off for them.
        </P>
        <H3>Search box</H3>
        <P>
          Type in the search box above the table. Every word must match the investor&apos;s name, job title, firm, firm domain, city or country.{" "}
          <Code>capital london</Code> finds people at firms with capital in the name who are based in London.
        </P>
        <H3>Filters</H3>
        <P>
          Filters sit as chips above the table. Press <B>Add filter</B>, pick a filter, then choose its values. Click a chip to change it, or its cross to
          remove it. <B>Clear all</B> removes every filter.
        </P>
        <Table
          head={["Group", "Filters"]}
          rows={[
            ["Person", "Job title, exclude titles, role, name"],
            ["Firm", "Firm name, exclude firms, firm industry, exclude industries, firm size, year founded, firm description"],
            ["Thesis", "Stage, exclude stages, sector focus, exclude sectors, specialties"],
            ["Location", "Region, country, exclude countries, state or county, city"],
            ["Contact data", "Email, phone, LinkedIn on file"],
            ["Your activity", "Outreach status, saved, Claude picks, fit score, one per firm"],
          ]}
        />
        <H3>How filters combine</H3>
        <Bullets
          items={[
            <><B>Different filters combine with AND.</B> Stage Seed and Sector focus FinTech means investors tagged with both.</>,
            <><B>Values inside one filter combine with OR.</B> Stage Seed and Pre-Seed means investors tagged with either.</>,
            <><B>Location filters count as one group.</B> Region, country, state and city together match any of the places you chose.</>,
            <><B>Exclude filters never match.</B> Exclude stages Buyout/PE leaves out every investor tagged with it, whatever else they match.</>,
            <><B>Text filters</B> (job title, name, firm name, firm description, specialties, city) match when the field contains any of your words, ignoring case.</>,
            <><B>Job titles</B> also find their short or long forms: MD finds managing director, GP finds general partner, VP finds vice president.</>,
            <><B>One per firm</B> keeps the best-fit person at each firm.</>,
          ]}
        />
        <H3>Search with AI</H3>
        <P>
          Describe the investors you want in a sentence, for example <Code>Seed fintech partners in London I can email</Code>. Claude turns it into
          ordinary filters, which appear as chips you can change like any other. Claude never sees or searches the database itself; it only proposes
          filters, and every one is checked against the real values before the search runs.
        </P>
        <Bullets
          items={[
            <>A banner shows the search&apos;s name, your request, a one-line summary and anything the filters could not express, under <B>Not covered</B>.</>,
            <>The database has no cheque sizes, fund sizes, portfolio companies or founder demographics. Requests that need them are matched as closely as the data allows and the gap is noted.</>,
            <>Your recent AI searches appear under the box and reopen without running again.</>,
            <>You can run 30 AI searches an hour and 150 a day.</>,
          ]}
        />
        <H3>Saved searches</H3>
        <P>
          Press <B>Save search</B> to keep the current filters and search text under a name. Open them again from <B>Saved searches</B>. While a saved search
          is open, Save offers to update it or save a new one.
        </P>
        <H3>Sorting, counts and pages</H3>
        <P>
          Results sort by fit score unless you choose name, firm, location, firm size, year founded or Claude picks order. Each page holds 50 rows. The
          count above the table is exact up to 10,000 and shows 10,000+ beyond that. You can page through the first 10,000 results of any search; the
          trial shows the first 500. Your filters, search and sort are kept while this tab is open.
        </P>
      </>
    ),
  },

  {
    id: "fit-score",
    title: "Fit score and Claude picks",
    summary: "How the 0 to 100 score is worked out, and how Claude builds your shortlist.",
    body: (
      <>
        <P>
          Every investor gets a fit score from 0 to 100, worked out from your startup profile. Scores below 0 count as 0 and scores above 100 count as
          100. The score updates as soon as you save your profile.
        </P>
        <Table
          head={["Signal", "Points"]}
          rows={[
            ["Sector", "30 if the firm is tagged with one of your sectors"],
            ["Specialties", "Up to 20: 5 for each of your match keywords in the firm's specialties"],
            ["Stage", "15 if they invest at your round; 5 if their stages are unknown"],
            ["Investor type", "10 if they are a type you asked for; 5 if you have no preference"],
            ["Location", "10 if they are in your country, or 5 if they are in your region"],
            ["Role", "Partner or angel 10, principal 8, venture partner 5, associate 4, platform 2, investor relations or LP minus 20"],
            ["Email on file", "5"],
            ["Private equity", "Minus 20 when you are raising pre-seed, seed, angel or Series A and the firm only does buyout, fund of funds, late stage or venture debt"],
          ]}
        />
        <H3>Claude picks</H3>
        <Steps
          items={[
            { title: "Claude chooses your match keywords", body: "8 to 20 keywords, taken only from the specialties investors in the database actually list, most specific first." },
            { title: "The database scores everyone", body: "Every investor gets a fit score with those keywords, and the top 60 are kept, one per firm." },
            { title: "Claude shortlists 25", body: "Claude reads those 60 firms and keeps up to 25 that would plausibly invest at your stage, each with a one-line reason drawn from the investor's own data." },
          ]}
        />
        <P>
          Press <B>Refresh Claude picks</B> on the Investors page to run all three steps again, for example after you change your round or sectors. Add the
          Claude picks filter to see only your shortlist.
        </P>
      </>
    ),
  },

  {
    id: "contact-details",
    title: "Contact details, reveals and exports",
    summary: "Truncated details, reveal credits, export credits and fair-use limits.",
    body: (
      <>
        <P>
          Emails and phone numbers show truncated until you reveal them, for example <Code>j•••@firm.com</Code> and <Code>+1 201-•••-••••</Code>.
          LinkedIn profiles and other email addresses appear once revealed. The full details never reach your browser before then.
        </P>
        <Bullets
          items={[
            <><B>Reveal.</B> Revealing an investor spends one reveal credit and shows their full details. The investor stays revealed for you, so you never pay twice for the same person.</>,
            <><B>Export.</B> Exports spend one export credit per row and every export is logged. Rows you already revealed or exported cost nothing. One export holds up to 500 rows and stops where your credits run out. You confirm the cost before anything is charged.</>,
            <><B>Allowance.</B> The plan includes 2,500 reveals and 2,500 export credits a month, resetting at the start of each billing period. The trial has 0 of each.</>,
          ]}
        />
        <P>
          The Billing page shows how many reveals and export credits you have used this period, and how many investors you have viewed today.
        </P>
        <H3>Fair-use limits</H3>
        <Table
          head={["Limit", "Trial", "Plan"]}
          rows={[
            ["Searches a minute", "40", "120"],
            ["Investor rows viewed a day", "1,500", "50,000"],
            ["AI searches", "30 an hour, 150 a day", "30 an hour, 150 a day"],
          ]}
          caption="The daily count resets at midnight UTC."
        />
        <P>
          The investor data is the product. These limits are far above what a founder uses in a day of real outreach, and they stop anyone copying the
          database in bulk. If you hit one, wait a minute or until midnight UTC.
        </P>
      </>
    ),
  },

  {
    id: "inbox-and-sending",
    title: "Your inbox and sending",
    summary: "Your sending inbox, the Outbox, daily limits, replies and automatic follow-ups.",
    body: (
      <>
        <P>
          Each founder gets one sending inbox, provided by OpenMail and created during onboarding. Investors see its address and your name on every email.
          Sending starts when your plan starts.
        </P>
        <H3>How the Outbox works</H3>
        <Steps
          items={[
            { title: "Choose investors", body: "Select investors on the Investors page and choose Queue emails. A batch holds up to 50 investors, so you can check each email." },
            { title: "Claude drafts each email", body: "Every draft is written for that investor from your profile. Edit any of them before you queue." },
            { title: "A worker sends every minute", body: "Queued emails go out from your inbox through the day. You can edit, send now or cancel anything that has not gone out yet." },
          ]}
        />
        <Table
          head={["Sending limit", "Value"]}
          rows={[
            ["Emails a day from one inbox", "20, counted per UTC day"],
            ["Emails a run from one inbox", "8, with a run every minute"],
            ["Over the daily limit", "Moves to the next morning, from 08:00 UTC"],
          ]}
          caption="The limits let a new inbox warm up gradually, which keeps your emails out of spam folders."
        />
        <H3>Replies</H3>
        <P>
          Replies arrive in <A href="/dashboard/inbox">Inbox</A>, and the investor is marked as replied in the database. We also email your login address
          when an investor replies. You can answer from Inbox and the reply goes in the same thread.
        </P>
        <H3>Automatic follow-ups</H3>
        <P>
          If an investor has not replied after the number of days you choose in <A href="/dashboard/settings">Settings</A> (2 to 14 days, 3 by default),
          one follow-up goes in the same thread. Claude writes it short, 40 to 70 words, and adds at most one new true fact. It waits in the Outbox for at
          least 30 minutes first, so you can edit or cancel it. It stops as soon as they reply. To stop all follow-ups, turn off{" "}
          <B>Send follow-ups automatically</B> in Settings.
        </P>
        <Callout tone="warning" title="Test mode">
          While Centrale is in testing, every email goes to a single test address instead of the investor. Each one carries a note at the top naming the
          real recipient, so testing can never reach a real investor.
        </Callout>
      </>
    ),
  },

  {
    id: "custom-domain",
    title: "Custom domain",
    summary: "Send from you@yourcompany.com: records to add, statuses and troubleshooting.",
    body: (
      <>
        <P>
          By default you send from an <Code>@omail.sh</Code> address. With a custom domain you send from an address on your own domain, such as{" "}
          <Code>amira@mail.yourcompany.com</Code>. Investors trust a real company domain more, and it matches the website they will visit. Set it up from{" "}
          <A href="/dashboard/domain">Custom domain</A> in the sidebar.
        </P>
        <Callout tone="tip" title="Use a subdomain">
          We recommend a subdomain such as <Code>mail.yourcompany.com</Code>. Your existing company email on <Code>yourcompany.com</Code> stays exactly as
          it is. A separate domain you own works too.
        </Callout>
        <H3>Steps</H3>
        <Steps
          items={[
            { title: "Enter the domain", body: <>For example <Code>mail.yourcompany.com</Code>.</> },
            { title: "We show the DNS records to add", body: "You add them at your DNS provider, such as Cloudflare, GoDaddy, Namecheap or Google Domains." },
            { title: "Add them exactly", body: "Copy each host and value exactly as shown, one record at a time." },
            { title: "We check automatically", body: <>Usually this takes a few minutes, and DNS can take up to 48 hours. Press <B>Check now</B> to check straight away.</> },
            {
              title: "Choose your mailbox name and switch",
              body: (
                <>
                  Once verified, choose the mailbox name, for example <Code>amira</Code>, and press <B>Switch inbox</B>. Your new address becomes{" "}
                  <Code>amira@mail.yourcompany.com</Code> and new emails send from it. Replies to your old address still arrive.
                </>
              ),
            },
          ]}
        />
        <H3>The records, in plain words</H3>
        <Table
          head={["Record", "What it does"]}
          rows={[
            [
              "MX",
              "Routes replies into Centrale. On a subdomain it does not affect your main email. On your root domain it would take over all inbound mail for that domain, so prefer a subdomain.",
            ],
            ["DKIM, three CNAME records", "Prove the mail really comes from you. Add all three."],
            [
              "Bounce MX and SPF TXT",
              "Set up the envelope sender, the hidden return address, so SPF passes. If that host already has an SPF record, merge our include into that one record. Never have two.",
            ],
            ["DMARC TXT", <>A policy record mailbox providers expect. <Code>p=none</Code> is safe and changes nothing about delivery.</>],
          ]}
          caption="Hosts and values are on the Custom domain page. They are specific to your domain, so copy them from there."
        />
        <H3>Statuses</H3>
        <Table
          head={["Status", "What it means"]}
          rows={[
            ["Pending", "We have your domain and are waiting for the records to appear."],
            ["Verifying", "We are checking your records. This runs on its own; you can also press Check now."],
            ["Verified", "Everything checks out. You can switch your inbox to this domain."],
            ["Failed", "The records did not check out. Compare each one with the page, fix it at your provider and press Check now."],
            ["Under review", "The domain is being reviewed before it can send. No action needed unless we contact you."],
          ]}
        />
        <H3>Troubleshooting</H3>
        <Bullets
          items={[
            <><B>There is already an MX record on the same host.</B> Remove it or use a different subdomain. Two sets of MX records split your replies.</>,
            <><B>Records were added on the root instead of the subdomain.</B> If your domain is <Code>mail.yourcompany.com</Code>, the records belong on <Code>mail</Code> and its sub-hosts, not on <Code>yourcompany.com</Code>. Check the host column at your provider.</>,
            <><B>Your provider adds the domain on its own.</B> Many do. Enter just the host part, for example <Code>mail</Code>, not <Code>mail.yourcompany.com</Code>, or you end up with <Code>mail.yourcompany.com.yourcompany.com</Code>.</>,
            <><B>Only one of the three DKIM records was added.</B> All three are needed before the domain verifies.</>,
            <><B>Two SPF records on one host.</B> SPF fails when there are two. Merge them into one record with both includes.</>,
            <><B>Cloudflare shows an orange cloud on the CNAME records.</B> Set them to DNS only (grey cloud). Proxied records cannot be verified.</>,
            <><B>A &quot;competing MX&quot; warning.</B> Another provider&apos;s MX record is on the same host. Replies may go there instead of Centrale until you remove it.</>,
          ]}
        />
        <H3>Removing a domain</H3>
        <P>
          You can remove your domain from the Custom domain page until your inbox has switched to it. Once your inbox sends from the domain, it stays
          connected so replies keep arriving. Remove the DNS records at your provider after removing a domain. You can have one custom domain at a time.
        </P>
      </>
    ),
  },

  {
    id: "pitch-deck",
    title: "Pitch deck",
    summary: "Five questions, a branded and sourced deck, and how many you can generate.",
    body: (
      <>
        <P>On the <A href="/dashboard/deck">Pitch deck</A> page you answer five questions:</P>
        <Bullets
          items={[
            "Revenue history: monthly revenue for the last six months, oldest first.",
            "Traction: customers, users, pilots and growth.",
            "Your raise and the use of funds.",
            "Your team.",
            "Competition: who else solves this and why customers choose you.",
          ]}
        />
        <H3>What happens when you press Generate</H3>
        <Steps
          items={[
            { title: "Your brand styles the deck", body: "Colours, fonts where available, logo, favicon and the homepage screenshot captured from your website." },
            { title: "Centrale researches your industry", body: "It searches the web for real statistics about your market and keeps the source of each one." },
            { title: "Claude writes the slides", body: "Using only your answers, your website and the researched facts." },
            { title: "A PDF is rendered", body: "Read it in the app, then download the PDF." },
          ]}
        />
        <Callout title="Every figure has a source">
          Every industry figure in the deck carries a numbered source, and the final slide lists the sources with links. Your own numbers come only from
          your answers. If you leave a question blank, the deck does not invent that number.
        </Callout>
        <P>
          It takes about one to three minutes and runs in the background, so you can leave the page and come back. Press <B>Refresh brand</B> on the deck page to read
          your homepage again, for example after a redesign. The page shows the deck stage as it runs: brand, research, writing, then the PDF. You can also upload your own deck instead from Startup profile.
        </P>
        <Table
          head={["", "Trial", "Plan"]}
          rows={[["Deck generations", "3", "20 per rolling 30 days"]]}
          caption="A generation that fails does not count toward the limit."
        />
      </>
    ),
  },

  {
    id: "plans-and-limits",
    title: "Plans and limits",
    summary: "The trial and the plan side by side.",
    body: (
      <>
        <Table
          head={["", "Trial", "Plan"]}
          rows={[
            ["Sending inbox", <>Yes, on <Code>@omail.sh</Code>; custom domain setup allowed</>, "Yes"],
            ["Sending and follow-ups", "No", "Yes, 20 new emails a day per inbox while it warms up"],
            ["Investor rows", "500", "Unlimited"],
            ["Rows per page", "Up to 50", "Up to 100"],
            ["Contact reveals", "0", "2,500 a month"],
            ["Export credits", "0", "2,500 a month"],
            ["Deck generations", "3", "20 per 30 days"],
            ["Investor rows viewed a day", "1,500", "50,000"],
            ["Searches a minute", "40", "120"],
          ]}
          caption="The plan price is shown on the Billing page."
        />
        <P>
          Reveals and export credits reset at the start of each billing period. The daily view count resets at midnight UTC. Deck generations count over
          the last 30 days, so each one frees up 30 days after it ran.
        </P>
      </>
    ),
  },

  {
    id: "billing",
    title: "Billing",
    summary: "Whop handles payments; how to manage, cancel, and what happens if a payment fails.",
    body: (
      <>
        <P>
          Payments are handled by Whop. Centrale never sees your card number. To change your card, see invoices or cancel, open{" "}
          <A href="/dashboard/billing">Billing</A> and press <B>Manage subscription</B>.
        </P>
        <Table
          head={["Situation", "What happens"]}
          rows={[
            ["Trial", "The Billing page shows the days left and the date your plan starts."],
            ["Payment fails", "Your plan shows as payment overdue and Billing asks you to update your card. Sending carries on while Whop retries the payment. If it still fails, the plan ends and sending stops; your queue stays in the Outbox."],
            ["You cancel", "You keep the plan until the end of the period you paid for."],
            [
              "Plan ends",
              "Sending, follow-ups, reveals and exports stop. Your profile, deck and emails stay in your account. Start the plan again from Billing whenever you like.",
            ],
          ]}
        />
      </>
    ),
  },

  {
    id: "privacy",
    title: "Privacy and data",
    summary: "What we use your data for, and how investor data is protected.",
    body: (
      <>
        <Bullets
          items={[
            "Your website scrape, your answers, your profile and your emails are only used to run your account: matching, drafting, sending and your deck.",
            "Your uploaded and generated decks are private to you. Each download link expires after a minute.",
            "Your login email is used for sign in and reply notifications. Investors see your sending address, not your login email.",
            "Investors' contact details are never sent to your browser in full until you reveal or export them, and search limits stop the database being copied in bulk.",
          ]}
        />
      </>
    ),
  },

  {
    id: "faq",
    title: "FAQ",
    summary: "Short answers to the questions founders ask most.",
    body: (
      <Faq
        items={[
          {
            q: "Why do my emails go to a test address?",
            a: "Centrale is in testing, so every email goes to one test inbox with a note naming the investor it was for. No real investor receives anything until live sending is switched on.",
          },
          {
            q: "Why can I not send during the trial?",
            a: "Sending starts when your plan starts, after the 7-day trial. You can read Claude's drafts and queue emails now; they wait in the Outbox until then.",
          },
          {
            q: "How long does domain verification take?",
            a: "Usually a few minutes once the records are added. DNS can take up to 48 hours. Press Check now on the Custom domain page to check straight away.",
          },
          {
            q: "Why are emails and phone numbers truncated?",
            a: "Contact details show in full only once you reveal or export them, which needs the plan. This protects the data from bulk copying.",
          },
          {
            q: "Can I use my main domain?",
            a: "You can, but the MX record would take over all inbound mail on that domain. Use a subdomain such as mail.yourcompany.com so your existing email is untouched.",
          },
          {
            q: "How do I stop follow-ups?",
            a: "Turn off Send follow-ups automatically in Settings. To stop one follow-up, cancel it in the Outbox. A reply from the investor stops theirs on its own.",
          },
          {
            q: "Where do replies go?",
            a: "Into Inbox in Centrale. We also email your login address when an investor replies. Replies to your old address still arrive after you switch to a custom domain.",
          },
          {
            q: "How are investors matched?",
            a: "Every investor gets a fit score from 0 to 100 from your sectors, their specialties, your stage, investor type, location and their role. Claude then reads the top 60 firms and shortlists 25.",
          },
          {
            q: "Why did my email not send today?",
            a: "Each inbox sends up to 20 emails a day while it warms up. Anything over the limit moves to the next morning.",
          },
          {
            q: "Do I pay twice to reveal the same investor?",
            a: "No. A revealed investor stays revealed for you, and rows you already revealed cost nothing to export.",
          },
          {
            q: "Can Claude invent numbers in my deck?",
            a: "No. Your own numbers come only from your answers, and every industry figure carries a numbered source listed on the last slide.",
          },
        ]}
      />
    ),
  },

  {
    id: "whats-new",
    title: "What's new",
    summary: "Recent changes to Centrale.",
    body: (
      <Changelog
        entries={[
          {
            date: "2026-10-09",
            items: [
              "A new investor database of about 335,000 investors, with firm industry, size, founding year, stages, sectors, specialties and descriptions.",
              "Filters are now chips above the table, with 31 filters including exclusions, and every one stacks with the others.",
              "Search with AI: describe the investors you want and get editable filters.",
              "Saved searches.",
            ],
          },
          {
            date: "2026-10-07",
            items: [
              "Custom domains: send from an address on your own domain.",
              "Your sending inbox is now created during onboarding.",
              "Pitch decks are styled with your brand and use researched, sourced industry figures.",
              "This documentation page.",
            ],
          },
          {
            date: "2026-10-01",
            items: ["Billing through Whop, with a 7-day free trial.", "Contact details show truncated during the trial."],
          },
          {
            date: "2026-09-29",
            items: [
              "The investor database, with filters, the fit score and Claude picks.",
              "Reveal credits, export credits and exports.",
              "The Outbox and automatic follow-ups.",
              "Pitch decks as PDF.",
            ],
          },
        ]}
      />
    ),
  },
];
