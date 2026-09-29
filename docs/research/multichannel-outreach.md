# Multichannel outreach: LinkedIn and WhatsApp for Centrale

Research date: 29 September 2026. Prices and limits change often; re-check the linked pages before committing.

## How to read this document

Each claim is tagged with where it comes from.

| Tag | Meaning |
| --- | --- |
| **[Official]** | Vendor developer docs, vendor pricing page, platform help centre, legislation or regulator guidance |
| **[Vendor claim]** | Vendor marketing pages or a vendor writing about a competitor. Treat as self-interested |
| **[Third party]** | Blogs, reviews, community reports. Useful signal, not verified |
| **[Uncertain]** | Sources conflict, or we could not confirm from a primary source |

Nothing here is legal advice. Section 4 lists the points we should put to a lawyer before launch.

## Summary and recommendation

1. **LinkedIn: use Unipile.** It is the only option we found that is a plain REST API, built for many end users each connecting their own account through a hosted, white-label auth link, with webhooks for new messages and accepted invitations, and priced per connected account (about 4 to 5 EUR per account per month at our likely scale). It works from Deno with `fetch`. The main risk is not technical: any third-party LinkedIn automation, Unipile included, conflicts with LinkedIn's User Agreement, and the founder's own account carries the restriction risk. We should design for that with conservative pacing, founder approval of every message, and clear disclosure.
2. **WhatsApp: do not offer cold WhatsApp.** Cold messages to investors' mobiles break WhatsApp's own terms on both the personal app and the official Business Platform, need prior consent under UK PECR for individual subscribers, and carry a high ban risk on a founder's personal number. Offer WhatsApp only as a follow-on channel once the investor has opted in (gave their number for this purpose, or messaged the founder first). For that narrow use, Unipile's WhatsApp connection (the founder's own number, 1:1, low volume) is the pragmatic fit. The official Cloud API is designed for businesses sending templates, not a founder chatting with an investor, and would force every founder through Meta business verification.
3. **Never send any phone or WhatsApp message to a number flagged `do_not_call`**, and treat "not DNC" as necessary but not sufficient: PECR consent is still required for WhatsApp messages to individuals.
4. **Rough cost per founder:** about 5 to 10 EUR per month in provider fees (one LinkedIn account, optionally one WhatsApp account), with a 49 EUR per month floor while we have 10 or fewer connected accounts.

---

## 1. Unipile

Unipile is a French company offering one REST API over LinkedIn, WhatsApp, Instagram, Messenger, Telegram, X, email and calendars, where your end users connect their own accounts. It does this through unofficial means (it is not a LinkedIn or Meta partner).

### 1.1 LinkedIn capabilities

| Capability | Supported | Detail | Source |
| --- | --- | --- | --- |
| Look up a profile from a LinkedIn URL | Yes | Take the public identifier from `linkedin.com/in/<id>`, call `GET /api/v1/users/{identifier}?account_id=...`, which returns the `provider_id` needed for invites and messages | [Official: invite users guide](https://developer.unipile.com/docs/invite-users) |
| Send a connection request with a note | Yes | `POST /api/v1/users/invite` with `account_id`, `provider_id`, optional `message` (max 300 characters). Errors include `errors/already_invited_recently`, `errors/already_connected`, `errors/limit_exceeded`, `errors/cannot_resend_yet`, `errors/too_many_characters`, `errors/disconnected_account` | [Official: API reference](https://developer.unipile.com/reference/userscontroller_adduserbyidentifier) |
| Cancel a sent invitation | Yes | Listed as a feature | [Vendor claim: LinkedIn API page](https://www.unipile.com/communication-api/messaging-api/linkedin-api/) |
| Message a connection | Yes | `POST /api/v1/chats` with `account_id`, `attendees_ids`, `text` for a new chat, or `POST /api/v1/chats/{chat_id}/messages` for an existing one. Attachments up to 15 MB | [Official: send messages](https://developer.unipile.com/docs/send-messages) |
| InMail | Yes | Same endpoint with `linkedin.inmail: true` and `api` set to `classic`, `sales_navigator` or `recruiter`. Needs a Premium or Sales Navigator account with credits, or targets open profiles | [Official: send messages](https://developer.unipile.com/docs/send-messages) |
| Create posts, comment, react | Yes | Retrieve and create posts, list and add comments, add reactions | [Official: provider features](https://developer.unipile.com/docs/list-provider-features), [Vendor claim](https://www.unipile.com/communication-api/messaging-api/linkedin-api/) |
| Search (classic, Sales Navigator, Recruiter) | Yes | Up to 1,000 results per search (classic), 2,500 (Sales Navigator, Recruiter) | [Official: provider limits](https://developer.unipile.com/docs/provider-limits-and-restrictions) |
| Webhook: new message | Yes | Source `messaging`, events `message_received`, `message_read`, `message_reaction`, `message_edited`, `message_deleted`, `message_delivered`. Our own sent messages also arrive as `message_received`, so compare the account's user id with `sender.attendee_provider_id` | [Official: new messages webhook](https://developer.unipile.com/docs/new-messages-webhook) |
| Webhook: accepted invitation | Yes, delayed | Source `users`, event `new_relation`, payload includes `user_provider_id`, `user_public_identifier`, `user_profile_url`. **May fire up to 8 hours after acceptance**, because Unipile polls LinkedIn at random intervals. If the invite had a note, acceptance also creates a chat that arrives via the message webhook, which is faster | [Official: detecting accepted invitations](https://developer.unipile.com/docs/detecting-accepted-invitations) |
| Webhook: account status | Yes | Source `account_status`, values `OK`, `CREDENTIALS` (needs reconnect), `ERROR`/`STOPPED`, `CONNECTING`, `DELETED`, `CREATION_SUCCESS`, `RECONNECTED`, `SYNC_SUCCESS` | [Official: account lifecycle](https://developer.unipile.com/docs/account-lifecycle) |

Webhook mechanics [Official: [webhooks](https://developer.unipile.com/docs/webhooks-2), [create webhook](https://developer.unipile.com/reference/webhookscontroller_createwebhook)]:

- Created with `POST /api/v1/webhooks`, body `request_url`, `source` (`messaging`, `email`, `email_tracking`, `account_status`, `users`), optional `events`, `account_ids` (defaults to all current and future accounts), `headers`, `format`.
- There is no HMAC signature. You authenticate by adding a secret custom header (for example `Unipile-Auth`) and checking it on receipt.
- You must return HTTP 200 within 30 seconds; otherwise Unipile retries five times with increasing delay. API-created webhooks do not send a JSON content type by default; set it in `headers`.
- History is not backfilled on first connection, but messages that arrive during a disconnection are delivered on reconnect.

### 1.2 How a founder connects LinkedIn

**Hosted auth wizard (recommended)** [Official: [hosted auth](https://developer.unipile.com/docs/hosted-auth)]:

- Our backend calls `POST /api/v1/hosted/accounts/link` with `type: "create"` (or `"reconnect"` plus `reconnect_account`), `providers` (for example `["LINKEDIN", "WHATSAPP"]`), a short `expiresOn`, `notify_url`, `name` (our user id), and `success_redirect_url` / `failure_redirect_url`.
- The founder is redirected to Unipile's white-label page and logs in there. Our `notify_url` receives `{ "status": "CREATION_SUCCESS", "account_id": "...", "name": "<our user id>" }`.
- Unipile advises against embedding the wizard in an iframe because of LinkedIn captchas and Microsoft OAuth screens, so open it as a full-page redirect.

**Custom auth (if we build our own UI)** [Official: [LinkedIn guide](https://developer.unipile.com/docs/linkedin)]:

- Credentials: email and password sent to `POST /api/v1/accounts`.
- Cookie: the `li_at` session cookie plus the browser's `user_agent` (Unipile strongly recommends the matching user agent to avoid disconnections).
- Checkpoints LinkedIn may raise: `2FA`, `OTP`, `IN_APP_VALIDATION` (approve in the LinkedIn mobile app), `PHONE_REGISTER`, `CAPTCHA`. Solve with `POST /api/v1/accounts/checkpoint` within 5 minutes. `TRY_ANOTHER_WAY` switches away from in-app validation. Storing a TOTP secret lets Unipile reconnect automatically.
- Proxy: pass your own proxy, or a `country` / `ip` so Unipile picks a proxy near the founder. Unipile says it assigns residential proxies to LinkedIn, Instagram and WhatsApp accounts [Vendor claim: [developer protection](https://www.unipile.com/developer-protection/)].

We should use the hosted wizard: we never touch the founder's LinkedIn password or cookie, and Unipile handles checkpoints in its own UI.

A third-party review reports that connecting with credentials can trigger a LinkedIn prompt about sharing account access and an "active sessions" prompt, which forces users to reconnect more often [Third party: [Swarmhit review](https://www.swarmhit.com/blog/unipile-review)]. Expect a reconnect flow to be a normal part of the product, driven by the `CREDENTIALS` status webhook.

### 1.3 Rate limits

Unipile adds no limits of its own. Its docs say it does not enforce limits, so your users hit the same ceiling they would in the LinkedIn UI [Official: [provider limits](https://developer.unipile.com/docs/provider-limits-and-restrictions); also [Unipile rate limits article, Aug 2026](https://www.unipile.com/linkedin-api-rate-limits/)]. Pacing is entirely our job. Its "smart rate limiting" and request queuing are advertised with some items marked "coming soon" [Vendor claim: [developer protection](https://www.unipile.com/developer-protection/)]. A competitor says the v2 API (beta) adds platform-level rate limiting [Vendor claim: [Linked API vs Unipile](https://linkedapi.io/vs/unipile)] [Uncertain].

Unipile's published LinkedIn guidance [Official: [provider limits](https://developer.unipile.com/docs/provider-limits-and-restrictions)]:

| Action | Guidance |
| --- | --- |
| Invitations, paid and active account | 80 to 100 per day, about 200 per week |
| Invitations, free account | About 5 per month with a note (200 characters), or about 150 per week without a note |
| Invitation note length | 300 characters (paid), 200 (free) |
| Profile lookups | About 100 per account per day (recommendation) |
| InMail | Up to 800 free InMails per month to open profiles; send 30 to 50 per day |
| Invitation and relations list polling | Use webhooks; if polling, only a few times a day at random times |
| WhatsApp | Wait up to 24 hours after connecting before outreach; leave at least 10 to 20 seconds between messages; limit new chats |

Unipile's 200 per week figure is at the top of what independent sources consider safe; our defaults should be much lower (see section 4.2).

### 1.4 Pricing

[Official: [pricing](https://www.unipile.com/pricing-api/)], billed per connected account, no per-request or per-message fees, all endpoints on every tier, 7-day free trial.

| Connected accounts | EUR per month | USD per month |
| --- | --- | --- |
| Up to 10 | 49 flat | 55 flat |
| 11 to 50 | 5 per account | 5.50 per account |
| 51 to 200 | 4 per account | 5 per account |
| 201 to 1,000 | 4 per account | 4.50 per account |
| 1,001 to 5,000 | 3.50 per account | 4 per account |
| 5,001+ | 3 per account | 3.50 per account |

A founder with LinkedIn and WhatsApp counts as two accounts. A third-party review says billing uses the peak account count in each 30-day window, not the average [Third party: [Swarmhit](https://www.swarmhit.com/blog/unipile-review)] [Uncertain]. We should delete accounts promptly when founders disconnect or churn.

### 1.5 Data residency and security

[Official: [security and compliance](https://www.unipile.com/security-compliance/)]: data hosted only in France on Scaleway, no transfers outside the EU, SOC 2 Type II, AES-256-GCM at rest, TLS in transit, DPA available on request. Unipile acts as our processor. It stores message content, so it must go on our sub-processor list and privacy notice. The page does not list Unipile's own sub-processors [Uncertain].

### 1.6 SDKs and Deno

- REST with an `X-API-KEY` header against a per-tenant DSN such as `https://apiN.unipile.com:PORT/api/v1/...`. If a non-standard port is a problem you can stay on 443 and pass `?port=` [Official: [API usage](https://developer.unipile.com/docs/api-usage)]. Responses are cursor-paginated. OpenAPI schema available for Postman.
- Node SDK for v1: [`unipile-node-sdk`](https://github.com/unipile/unipile-node-sdk). A separate TypeScript SDK `@unipile/sdk` targets the v2 API, which is in beta [Official: [unipile-node](https://github.com/unipile/unipile-node)]. Neither states Deno support.
- **Deno works with plain `fetch`**; we do not need the SDK. Supabase Edge Functions only block outbound ports 25 and 587, so the DSN port is fine; limits to design around are 2 s CPU per request, 256 MB memory, 150 s idle timeout and 400 s wall clock on paid plans [Official: [Supabase limits](https://supabase.com/docs/guides/functions/limits)]. Webhook handlers should acknowledge fast and do heavier work in the background.
- Recommendation: build on v1 (GA) now; v2 is beta.

---

## 2. Alternatives for LinkedIn via API

Background: LinkedIn's own Invitations and Messages APIs are restricted to approved partners, and even partners may only send messages tied to a specific member action, with an editable draft the member affirmatively sends; automated or scheduled sends are excluded [Official: [Messages API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages), [Invitations API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/invitations)]. There is no sanctioned route, so every option below is unofficial.

| Provider | Kind | Invite via API | Message via API | Webhooks | Multi-tenant (our founders' own accounts, our UI) | Price | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Unipile** | Developer API | Yes, with note | Yes, plus InMail | Messages, new relation, account status | Yes, built for it (hosted auth, `name` field to map users) | 49 EUR for first 10 accounts, then 3 to 5 EUR per account ([Official](https://www.unipile.com/pricing-api/)) | Also WhatsApp, Instagram, Telegram, email |
| **Linked API** | Developer API, cloud browser per account | Yes, `st.sendConnectionRequest` with note ([Official](https://linkedapi.io/docs/action-st-send-connection-request)) | Yes | Event monitoring via `st.syncNetwork`; classic webhooks not clearly documented ([Official](https://linkedapi.io/docs/working-with-connection-requests)) [Uncertain] | Seat per account; how end users connect inside a third-party SaaS is not documented [Uncertain] | 49 USD (Core) or 74 USD (Plus) per seat per month on annual billing ([Official](https://linkedapi.io/pricing)) | Runs a real cloud browser at human pace and returns `limitExceeded` rather than sending past limits ([Vendor claim](https://linkedapi.io/vs/unipile)). LinkedIn only; about 10 to 15 times Unipile's per-account cost |
| **LinkupAPI** | Developer API | Yes | Yes, also WhatsApp and email | Yes, replies ([Official](https://linkupapi.com/pricing)) | Claims unlimited connected accounts, no per-account fee | 29 USD for 500 credits, 150 USD for 5,000, 3,000 USD unlimited ([Official](https://linkupapi.com/pricing)) | Credit per action. Claims 150 invites per week cap per seat and dedicated IP per account ([Vendor claim](https://linkupapi.com/solution/linkedin-automation-api)). Smaller and less proven; worth a second look |
| **HeyReach** | Campaign SaaS with API | Via campaigns (add leads to a campaign) | Campaign steps; inbox via API claimed | Yes: connection sent/accepted, message sent/reply, InMail, and more ([Third party: MindCloud docs](https://mindcloud.co/docs/universal/rest/hey-reach/latest)) | Accounts are connected inside HeyReach; white label on Agency plan | Growth 79 USD per sender per month; Agency 999 USD (25 senders, up to 50); Unlimited 2,999 USD (up to 300) ([Official](https://www.heyreach.io/pricing)). A third party lists Unlimited at 1,999 USD [Uncertain] | Campaign API launched April 2026 ([Official](https://www.heyreach.io/blog/campaign-api)). LinkedIn removed HeyReach's company page and restricted its executives' profiles on 25 March 2026; HeyReach says customer accounts were unaffected ([Official: HeyReach](https://www.heyreach.io/blog/heyreach-ban)) |
| **Expandi** | Campaign SaaS | Only by adding people to a campaign through "reversed webhooks" | Campaign steps | Outbound webhook events ([Official](https://help.expandi.io/en/articles/5405651-webhook-events)) | White label on Agency plan; no public REST API ([Third party](https://docs.getcargo.ai/integration/expandi)) | 99 USD per seat per month, 79 annual ([Official](https://expandi.io/pricing/)) | Not a fit for a product UI |
| **La Growth Machine** | Campaign SaaS | Via audiences and campaigns (`POST /flow/leads`) | Campaign steps | API and webhooks on Pro and above ([Official](https://lagrowthmachine.com/pricing/)) | Per identity, managed in LGM | Basic 60 EUR, Pro 120 EUR per identity per month; Ultimate price unclear from the page [Uncertain] | No WhatsApp. Rate limit 50 calls per 10 s ([Third party](https://overloop.com/blog/la-growth-machine-review)) |
| **lemlist** | Campaign SaaS | Via campaign LinkedIn steps | Campaign steps, WhatsApp add-on | Yes, including `linkedinInviteDone`, `linkedinInviteAccepted`, `linkedinReplied`, `whatsappMessageSent` ([Official](https://developer.lemlist.com/api-reference/objects-definitions/webhook)) | Per user in lemlist | Email 55 USD (annual) or 69 USD (monthly); Multichannel 87 or 109 USD per user per month ([Official](https://www.lemlist.com/pricing)) | Would duplicate our email stack |
| **Waalaxy** | Campaign SaaS | Only by importing a prospect into a Waalaxy campaign (`POST /prospects/addProspectFromIntegration`) | Campaign steps | Paid plans ([Third party](https://www.swarmhit.com/blog/waalaxy-review)) | No | Pro 19 EUR (300 invites/month), Advanced 49 EUR (800, API), Business 69 EUR per user per month ([Official](https://www.waalaxy.com/pricing)) | Prospect pipe only ([Official: docs](https://docs.waalaxy.com/introduction)) |
| **PhantomBuster** | Scraping and automation scripts | Via "Auto Connect" phantom launched through API | Via "Message Sender" phantom | Output to integrations | No, one workspace with session cookies | Start 69, Grow 159, Scale 439 USD per month by execution hours ([Third party](https://emelia.io/hub/phantombuster-pricing)) | Batch-oriented; not an inbox |
| **Proxycurl** | Enrichment only | No | No | No | n/a | Shut down | Closed on 4 July 2025 after LinkedIn sued it in January 2025 ([Official: Proxycurl](https://nubela.co/blog/goodbye-proxycurl/)) |
| **Bright Data** | Public-data scraping and datasets | No | No | No | n/a | Scraper API about 1.50 USD per 1,000 records; datasets from 250 USD per 100k records ([Third party](https://apiserpent.com/blog/brightdata-linkedin-pricing-explained), [Official: dataset](https://brightdata.com/products/datasets/linkedin/profiles)) | Enrichment only (public profile data). Useful for filling missing `linkedin_url`, not for outreach |

Takeaways:

- Campaign tools (HeyReach, Expandi, LGM, lemlist, Waalaxy) own the sequence and the inbox. Centrale already has its own email outbox and unified inbox, so we would be fighting their model and paying 60 to 110 USD per founder per month.
- Developer APIs (Unipile, Linked API, LinkupAPI) fit our architecture. Unipile wins on price per account, breadth (WhatsApp in the same API), maturity, EU hosting and documented hosted auth. Linked API is the "safer by design" alternative if restriction rates become a problem, at a much higher per-seat price.
- The enforcement climate is tightening. Several third-party sources describe a 2026 LinkedIn crackdown on automation, including an estimate that about 40 percent of accounts on non-compliant tools received some restriction in Q1 2026 ([Third party: LinkedCamp summary](https://www.linkedcamp.com/blog/40-percent-flagged-tools-restricted-q1-2026-post-heyreach), [Third party: Valley](https://www.joinvalley.co/blog/linkedin-automation-safety-2026)) [Uncertain: we could not trace the underlying data].

---

## 3. WhatsApp options

### 3.1 Two different products

| | Unipile WhatsApp (personal or WhatsApp Business app) | WhatsApp Business Platform, Cloud API (Meta directly or via a BSP) |
| --- | --- | --- |
| How it connects | Founder scans a QR code or enters a pairing code; Unipile runs as a linked device ([Official](https://developer.unipile.com/docs/whatsapp)) | Business creates a WhatsApp Business Account (WABA), verifies the business, registers a number, gets a display name approved. Multi-tenant SaaS does this via Embedded Signup as a Tech Provider ([Official: Meta](https://developers.facebook.com/docs/whatsapp/embedded-signup)) |
| Official status | Not a Meta partner; Unipile says it relies on "DMA interoperability" ([Vendor claim](https://www.unipile.com/communication-api/messaging-api/whatsapp-api/)) [Uncertain: we could not confirm Meta treats this as sanctioned interoperability] | Official |
| Sender identity | The founder's own number and name | A business number and business display name |
| First message to someone | Free text to any number, formatted as `<digits>@s.whatsapp.net` ([Official](https://developer.unipile.com/docs/send-messages)) | Only with a Meta-approved template, and only after opt-in ([Official: policy](https://whatsappbusiness.com/policy/)) |
| Replies | Free text | Free text inside the 24-hour customer service window opened by the user's message; templates outside it |
| Cost | Unipile per-account fee only | Meta per-message fees plus BSP fees (below) |
| Main risk | Number banned for unsolicited or automated messaging; no recovery path for a personal number ([Third party](https://www.codewords.ai/blog/whatsapp-business-api-vs-unofficial-api)) | Quality rating drops and sending limits from blocks and reports; approval overhead |

### 3.2 Rules for cold messaging

- **Business Platform:** you may only initiate conversations using an approved template, and only after the recipient has given opt-in permission to receive messages from you. The policy says not to "spam, or surprise people". Users can block or report, and Meta limits sending based on that feedback [Official: [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/)]. So the official API does not permit cold outreach either.
- **Personal app via Unipile:** WhatsApp's terms prohibit using the service through unauthorised or automated means and allow account suspension [Official: [WhatsApp Terms of Service (EEA)](https://www.whatsapp.com/legal/terms-of-service-eea)]. Unipile's own page tells customers to respect Meta's terms and avoid spam or bulk unauthorised automation [Vendor claim](https://www.unipile.com/communication-api/messaging-api/whatsapp-api/). Community reports say WhatsApp's detection weights low reply ratios, messaging strangers, and robotic timing [Third party: [CodeWords](https://www.codewords.ai/blog/whatsapp-business-api-vs-unofficial-api), [Leadnotifi](https://leadnotifi.com/articles/unofficial-whatsapp-tools-ban-risk)]. Cold messaging investors from a founder's personal number fits all three.

### 3.3 Business Platform pricing

- Per-message pricing since 1 July 2025. Marketing templates are always charged; utility and authentication templates are charged outside the customer service window; service (free-form) replies inside the 24-hour window have been free; 72-hour free entry point for Click-to-WhatsApp ads [Official: [Meta pricing](https://developers.facebook.com/docs/whatsapp/pricing)]. Rates depend on the recipient's country code.
- **Change on 1 October 2026 (in two days):** Zendesk, a BSP, announced on 10 August 2026 that Meta will start charging per message for non-template replies and utility templates sent inside the customer service window [Official: [Zendesk help](https://support.zendesk.com/hc/en-us/articles/11113277351322-Announcing-upcoming-changes-to-WhatsApp-Business-messaging-pricing)]. Another BSP says each number gets 1,000 free service messages per month before charges start [Third party: [Gallabox](https://gallabox.com/blog/whatsapp-service-message-pricing)]. Meta's developer pricing page, as we fetched it today, only listed country-specific rate changes for 1 October [Uncertain: confirm on Meta's rate card].
- UK marketing template rate: reported as rising from about 0.0529 USD to 0.0635 USD on 1 July 2026 [Third party: [YCloud](https://www.ycloud.com/blog/whatsapp-api-message-pricing-update-effective-july-1-2026)]; another source quotes 0.0382 GBP [Third party: [PayPerWA](https://payperwa.com/blog/whatsapp-business-api-pricing-uk-2026)] [Uncertain: check Meta's rate card CSV].

BSP fees on top of Meta's:

| BSP | Fee | Source |
| --- | --- | --- |
| Meta Cloud API directly (as a Tech Provider) | No BSP fee; Meta fees only. Embedded Signup onboarding capped at 10 customers per rolling 7 days until business verification, app review and access verification raise it to 200 | [Official: Meta](https://developers.facebook.com/docs/whatsapp/embedded-signup) |
| Twilio | 0.005 USD per message, inbound and outbound, plus Meta fees; 0.001 USD per failed message | [Official: Twilio](https://www.twilio.com/en-us/whatsapp/pricing) |
| 360dialog | From 49 EUR per number per month, no markup on Meta fees | [Official: 360dialog](https://360dialog.com/pricing) (figures via [Third party](https://ezcontact.ai/en/blog/2026-07-04-360dialog-pricing-2026-real-monthly-costs-api-fees/)) |
| Bird (MessageBird) | Small per-message processing fee on top of Meta rates; exact tiers unclear | [Third party: Chatarmin](https://chatarmin.com/en/blog/bird-pricing) [Uncertain] |

### 3.4 Verdict on WhatsApp

For Centrale, the Business Platform is the wrong shape: every founder would need their own verified WABA and business display name, messages would come from a "business" rather than the founder, and it still requires opt-in before the first template. The personal-app route matches how founders and investors actually use WhatsApp, but only once the investor has invited it. So: WhatsApp as a reply and follow-on channel with consent, via Unipile, no automation of first contact.

---

## 4. Compliance and risk

### 4.1 LinkedIn terms

LinkedIn User Agreement, effective 3 November 2025, section 8.2 "Don'ts" [Official: [User Agreement](https://www.linkedin.com/legal/user-agreement)] includes:

- Do not use another's account, "such as sharing log-in credentials or copying cookies".
- Do not "use bots or other unauthorized automated methods to access the Services, add or download contacts, send or redirect messages", or drive inauthentic engagement.
- Do not use software, scripts or browser plugins to scrape or copy the Services.

LinkedIn Help says it does not allow third-party software or browser extensions that scrape, modify the appearance of, or automate activity on its website, and accounts using them may be restricted or suspended [Official: [LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a1340567)].

What this means for us: routing a founder's account through Unipile (or any listed alternative) is contrary to LinkedIn's terms. The contractual exposure sits mainly with the founder (their account), and with Unipile as the operator of the tooling. LinkedIn has sued data vendors (Proxycurl, 2025) but the reported cases involved fake accounts and scraping, not a member acting on their own account [Official: [Proxycurl](https://nubela.co/blog/goodbye-proxycurl/)]. LinkedIn has also taken action against a tool vendor's own LinkedIn presence (HeyReach, March 2026) [Official: [HeyReach](https://www.heyreach.io/blog/heyreach-ban)]. Centrale's own company page and founders' personal profiles could be exposed in the same way if we market the feature loudly as LinkedIn automation.

Mitigations we can control:

- Founder approves every LinkedIn note and message (Claude drafts, founder edits and clicks send or approves a batch). This mirrors LinkedIn's own rules for its partner Messages API: a specific member action, an editable draft, an affirmative send [Official: [Messages API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages)].
- Low volumes, working hours only, randomised gaps.
- Explicit opt-in screen when connecting LinkedIn that states the account restriction risk and that the founder is responsible for their account.
- Market it as "LinkedIn in your outreach workspace", not "LinkedIn automation".

### 4.2 Invitation limits and safe pacing

What LinkedIn officially says [Official: [invitation limit reached](https://www.linkedin.com/help/linkedin/answer/a550555), [types of restrictions](https://www.linkedin.com/help/linkedin/answer/a551012/types-of-restrictions-for-sending-invitations)]:

- LinkedIn does not publish a number. All members, Basic and Premium, are subject to invitation limits.
- Restrictions are triggered by sending many invitations in a short time, or many being ignored, left pending or marked as spam, and suspected automation can lead to suspension.
- Hitting the limit typically restricts invites for one week; withdrawing invites does not lift it; LinkedIn cannot shorten it. Excess outstanding invitations can mean up to a month.
- A withdrawn invitation cannot be resent to that person for up to three weeks.

What practitioners report [Third party]:

| Source | Connection requests | Messages to connections | Other |
| --- | --- | --- | --- |
| [PhantomBuster, 2026](https://phantombuster.com/blog/linkedin-automation/linkedin-automation-safe-limits-2026/) | New accounts 10 to 15 per day, 40 to 60 per week; aged accounts 15 to 25 per day, 60 to 100 per week | 20 to 40 per day (new), 40 to 80 (aged) | Keep acceptance above 30 percent; withdraw pending invites after 14 to 21 days; 4-week warm-up; Premium does not raise invite limits |
| [Search summary of several 2026 blogs](https://www.linkedhelper.com/blog/linkedin-automation-limits) | Most users about 100 per week; strong accounts 150 to 200 | n/a | Flagged accounts drop to 20 to 30 per week |
| Free accounts, notes | About 5 personalised notes per month, reportedly cut to 3 for some accounts in late 2025 ([Dripify help](https://help.dripify.com/en/articles/8490987-limited-personalized-connection-request-notes-for-free-linkedin-accounts), [SalesRobot](https://www.salesrobot.co/blogs/linkedin-limit)) | | Premium, Sales Navigator and Recruiter do not have the note cap |

Proposed Centrale defaults per LinkedIn account (founders can lower, not raise beyond the cap):

| Action | Default | Hard cap |
| --- | --- | --- |
| Connection requests | 10 per day, 50 per week, first 2 weeks 5 per day | 20 per day, 80 per week |
| Invitation notes on free accounts | Off by default (send without a note, email carries the pitch); use the monthly allowance only on hand-picked investors | Detect `feature_not_subscribed` / limit errors and fall back to no note |
| Messages to new connections | 30 per day | 50 per day |
| Profile lookups (URL to provider id) | 50 per day | 80 per day |
| Minimum gap between actions | Random 2 to 8 minutes | |
| Active hours | 08:30 to 18:30 in the founder's timezone, weekdays | |
| Withdraw pending invites | After 21 days | |
| Auto-pause | On `limit_exceeded`, `cannot_resend_yet`, HTTP 429/500 bursts, account status other than `OK`, or 7-day acceptance rate below 25 percent | Pause for 7 days on a limit error |

### 4.3 GDPR and PECR (UK and EU)

UK:

- PECR "electronic mail" covers email, SMS, in-app messages and **direct messages on social media**, so LinkedIn DMs, LinkedIn invite notes and WhatsApp messages are in scope if they are direct marketing [Official: [ICO key concepts](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-direct-marketing-using-electronic-mail/key-concepts-for-direct-marketing-using-electronic-mail/)].
- Individual subscribers (people, sole traders, ordinary English partnerships) need specific prior consent, or the soft opt-in (existing customers only). Corporate subscribers (companies, LLPs, Scottish partnerships) may be emailed without consent, but you must identify yourself and offer an opt-out in every message [Official: [ICO electronic mail marketing](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/)].
- The practical consequence: an email to `partner@fund.com` at an LLP or limited company is on the corporate side. A LinkedIn account and a personal WhatsApp number belong to the individual, so messages there are likely to individual subscribers and need consent if they count as direct marketing. [Uncertain: whether a founder's investment pitch is "advertising or marketing material" is a legal judgement; we should assume yes.]
- Since 5 February 2026 the Data (Use and Access) Act 2025 raised PECR fines to UK GDPR levels (up to 17.5m GBP or 4 percent of turnover) and applies PECR to the intended recipient whether or not a message is exchanged [Third party: [Clifford Chance](https://www.cliffordchance.com/insights/resources/blogs/talking-tech/en/articles/2026/02/key-aspects-of-the-data--use-and-access--act-take-effect.html), [Blake Morgan](https://www.blakemorgan.co.uk/data-use-and-access-act-2025-privacy-and-electronic-communications-regulations/)].
- The sender or the instigator is responsible. The founder instigates; Centrale provides the tool and the investor data. For the directory data, Centrale is likely a controller in its own right.

EU:

- The ePrivacy Directive is implemented differently per country. Germany (UWG section 7) is reported to require prior consent even for B2B email, while France and the Netherlands are more permissive for professional messages to corporate addresses [Third party: [Overloop](https://overloop.com/blog/b2b-cold-email-germany-gdpr-compliance), [Certified Senders Alliance](https://certified-senders.org/email-directive/2-permission/)].

GDPR, both regimes:

- Lawful basis for processing investor data is likely legitimate interests, supported by a documented balancing test.
- Article 14 transparency: when data was not obtained from the person, they must be told who we are, the source, and their rights, at the latest at first communication [Official: [GDPR Article 14](https://gdpr-info.eu/art-14-gdpr/)]. Every first-touch message, on any channel, should link to a short notice and an opt-out that suppresses all channels.
- Right to object to direct marketing is absolute (Article 21(2) and (3)): an opt-out on one channel must stop all channels for that investor across every founder, or at least that founder.

Separate UK point: pitching an investment in a startup can be a financial promotion under FSMA section 21. Founders usually rely on exemptions such as Article 19 of the Financial Promotion Order (investment professionals), which needs the communication to state who it is directed at [Third party: [Boyes Turner](https://www.boyesturner.com/news-and-insights/financial-promotions)]. Short LinkedIn and WhatsApp messages make that harder to do. Worth a line in the founder terms and a lawyer's view.

### 4.4 Do-not-call and WhatsApp

- Our directory already flags numbers marked DNC (`investors.do_not_call`) and never surfaces those numbers (see `supabase/migrations/20260929100000_investor_directory.sql`). Keep that: **no WhatsApp message or call to a contact whose number was DNC-flagged**, even if another number exists for them, unless they later give consent directly.
- UK TPS and CTPS apply to live marketing calls; you must not call registered numbers without consent [Official: [ICO telephone marketing](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/telephone-marketing/)]. WhatsApp voice calls would fall under this. Text-style messages fall under the electronic mail rules (consent for individuals), so a clean TPS status does not make a WhatsApp message lawful.
- US: the FCC codified that National Do-Not-Call Registry protections extend to text messages, effective 26 March 2024; marketing texts to registered wireless numbers need prior express invitation or permission [Official: [Federal Register](https://www.federalregister.gov/documents/2024/01/26/2023-28832/targeting-and-eliminating-unlawful-text-messages-implementation-of-the-telephone-consumer-protection)]. Whether an OTT WhatsApp message is a "text" under the TCPA is unsettled [Uncertain], but the safe reading is to honour DNC flags for WhatsApp.
- Data-vendor mobile numbers for cold WhatsApp is the riskiest combination we could build: PECR consent, WhatsApp terms, ban risk on the founder's number, and reputational harm with investors who talk to each other.

### 4.5 Questions for a lawyer

1. Is a founder's fundraising outreach "direct marketing" under PECR, and does a LinkedIn connection note count?
2. Controller and processor split between Centrale and each founder, for directory data and for messages sent.
3. Wording of the Article 14 notice and a cross-channel opt-out.
4. Founder terms: responsibility for their LinkedIn account and WhatsApp number, and financial promotion wording.
5. Whether to block LinkedIn and WhatsApp outreach to investors located in Germany by default.

---

## 5. Recommended architecture for Centrale

### 5.1 Providers

| Channel | Provider | Why |
| --- | --- | --- |
| Email | OpenMail (unchanged) | Already built |
| LinkedIn | Unipile v1 REST | Per-account pricing, hosted auth, webhooks, EU hosting |
| WhatsApp (consented only) | Unipile, founder's own number | Same integration and webhook as LinkedIn; matches founder-to-investor use |
| Enrichment (optional) | Bright Data or similar, only to fill missing `linkedin_url` | Keeps outreach and data acquisition separate |

Revisit Linked API if restriction rates in the pilot are bad, and the official WhatsApp Cloud API only if we later add business-style broadcast features with opt-in.

### 5.2 Connecting accounts

1. Settings page: "Connect LinkedIn" and "Connect WhatsApp" buttons, each behind a consent screen explaining the risks and our pacing.
2. New edge function `connect-account` (authenticated) calls `POST /api/v1/hosted/accounts/link` with `providers: ["LINKEDIN"]` (or `["WHATSAPP"]`), `name` = the founder's user id, `expiresOn` = now plus 30 minutes, `notify_url` = our `unipile-webhook` function with a secret query token, and success and failure redirects back to `/dashboard/settings`. For a disconnected account it sends `type: "reconnect"` and `reconnect_account`.
3. The browser is redirected (not an iframe) to the returned URL.
4. On `CREATION_SUCCESS` we insert `connected_accounts`, then wait for status `OK` before any action. For LinkedIn we fetch the founder's own profile to record whether they have Premium or Sales Navigator (affects notes and InMail). For WhatsApp we enforce a 24-hour quiet period.
5. The Unipile API key lives in Vault and is read via `get_app_secret()`, like other function secrets.

### 5.3 Tables

Fits alongside `outreach_messages`, `scheduled_emails` and `private.webhook_events`. All public tables get RLS on `owner_id`; workers use the service role.

**`public.connected_accounts`**

| Column | Notes |
| --- | --- |
| `id` uuid pk | |
| `owner_id` uuid | references `auth.users` |
| `channel` text | `linkedin` or `whatsapp` |
| `unipile_account_id` text unique | |
| `status` text | mirrors Unipile: `connecting`, `ok`, `credentials`, `error`, `stopped`, `deleted` |
| `display_name`, `provider_user_id`, `phone_e164` | from Unipile |
| `linkedin_tier` text | `free`, `premium`, `sales_navigator`, `recruiter` |
| `timezone` text, `active_from`, `active_to` time | working hours |
| `daily_invite_cap`, `weekly_invite_cap`, `daily_message_cap` int | founder-lowerable defaults from 4.2 |
| `warmup_until`, `paused_until` timestamptz, `pause_reason` text | |
| `connected_at`, `last_status_at` timestamptz | |

**`public.investor_channel_links`** (per founder account and investor)

| Column | Notes |
| --- | --- |
| `connected_account_id`, `investor_id` | composite key |
| `provider_user_id` text | LinkedIn `provider_id`, or WhatsApp `<digits>@s.whatsapp.net` |
| `public_identifier` text | LinkedIn slug |
| `relation` text | `none`, `invited`, `connected`, `withdrawn`, `already_connected` |
| `invited_at`, `connected_at`, `withdrawn_at` | |
| `chat_id` text | Unipile chat once one exists |

**`public.channel_consents`**

| Column | Notes |
| --- | --- |
| `owner_id`, `investor_id`, `channel` | |
| `basis` text | `investor_opted_in`, `investor_messaged_first`, `investor_shared_number` |
| `evidence` jsonb | message id or note |
| `captured_at`, `withdrawn_at` | |

Plus a global suppression list (`public.contact_suppressions` or a column on `investors`) for opt-outs that apply across channels.

**`public.channel_messages`** (the non-email half of the unified inbox)

| Column | Notes |
| --- | --- |
| `id` uuid pk, `owner_id`, `investor_id` (nullable until matched), `connected_account_id` | |
| `channel` text | `linkedin`, `linkedin_inmail`, `linkedin_invite_note`, `whatsapp` |
| `direction` text | `outbound`, `inbound` |
| `provider_message_id` text unique, `provider_chat_id` text | from Unipile |
| `body` text, `attachments` jsonb | |
| `sent_at`, `delivered_at`, `read_at` | from `message_delivered`, `message_read` |
| `raw` jsonb | trimmed webhook payload for debugging |

Unified inbox: a view `public.inbox_items` that unions `outreach_messages` (email) and `channel_messages`, grouped by investor, so the existing inbox UI shows one thread per investor with a channel badge per message.

**Sequences**

- `public.sequences` (per founder, or a Centrale default): name, active flag.
- `public.sequence_steps`: `sequence_id`, `position`, `channel` (`email`, `linkedin_invite`, `linkedin_message`, `linkedin_inmail`, `whatsapp`), `trigger` (`start`, `after_previous`, `after_linkedin_accept`, `after_consent`), `delay_hours`, `condition` (`no_reply`, `always`), `template` or Claude prompt key, `requires_approval` boolean (true for all LinkedIn and WhatsApp steps).
- `public.sequence_enrollments`: `owner_id`, `investor_id`, `sequence_id`, `status` (`active`, `replied`, `completed`, `stopped`, `opted_out`), `stopped_reason`.
- `public.outreach_steps`: the executable queue, generalising `scheduled_emails`. Columns: `enrollment_id`, `step_id`, `channel`, `status` (`waiting_trigger`, `awaiting_approval`, `queued`, `sending`, `sent`, `skipped`, `cancelled`, `failed`), `send_after`, `body`, `attempts`, `last_error`, `result_message_id`. Email steps can keep writing through `scheduled_emails` at first, then migrate.
- `private.account_actions`: `connected_account_id`, `action` (`invite`, `message`, `profile_lookup`, `withdraw`), `at`. Counted for daily and weekly caps; cheap index on (`connected_account_id`, `action`, `at`).

### 5.4 Webhooks into the unified inbox

One edge function, `unipile-webhook`, registered once per source (`messaging`, `users`, `account_status`) plus the hosted-auth `notify_url`:

1. Check the secret header with a constant-time compare; reject otherwise.
2. De-duplicate with `private.webhook_events` (key: source plus `message_id`, or `account_id` plus `user_provider_id` for relations).
3. Return 200 immediately and continue with `EdgeRuntime.waitUntil`, since Unipile retries if it does not get a 200 within 30 seconds.
4. Route by source:
   - `account_status`: update `connected_accounts.status`; on `CREDENTIALS` pause all steps for that account and email the founder a reconnect link.
   - `messaging` / `message_received`: ignore if the sender is the connected account itself (our own outbound echo), else find the investor by `investor_channel_links.provider_user_id` or chat id, insert an inbound `channel_messages` row, mark the enrollment `replied`, cancel pending steps on all channels, and reuse the existing reply notification. Unmatched senders still land in the inbox with `investor_id` null.
   - `users` / `new_relation`: set `relation = connected`, then release the waiting `after_linkedin_accept` step with a random 2 to 24 hour delay (so the message does not look instant).
   - Also treat a new chat created by acceptance of an invite with a note as an acceptance signal, since it arrives faster than `new_relation`.
5. Nightly, at a random time per account, list sent invitations as a backstop and withdraw those older than 21 days.

### 5.5 Worker, pacing and guards

Extend `process-outbox` (already on pg_cron every minute) or add `process-channels`. For each due `outreach_steps` row, in this order:

1. Enrollment still `active`, investor not suppressed, no reply on any channel since the step was queued.
2. Account `status = ok`, not paused, inside the founder's active hours, past `warmup_until` rules.
3. Caps from `private.account_actions` for today and the rolling 7 days; if over, push `send_after` to the next active window with jitter.
4. At least a random 2 to 8 minutes since that account's last action; only one in-flight action per account (use `for update skip locked` on the account row).
5. Channel-specific guards:
   - LinkedIn invite: need `provider_user_id` (resolve from `linkedin_url` first, counts as a profile lookup); skip if already connected or invited in the last 3 weeks; drop the note if the account is free and the monthly note allowance is spent.
   - LinkedIn message: only after `relation = connected`.
   - WhatsApp: require an active `channel_consents` row, `investors.do_not_call = false`, a number that was not DNC-flagged, and the account's 24-hour quiet period elapsed. Never a first touch.
6. Send via Unipile; log to `account_actions` and `channel_messages`; map errors: `limit_exceeded` or `cannot_resend_yet` pause the account for 7 days, `disconnected_account` sets status `credentials`, 429/500 back off exponentially.

### 5.6 Default sequence

| Day | Step | Condition | Approval |
| --- | --- | --- | --- |
| 0 | Email (existing flow) | Always | Existing batch composer |
| 0, a few hours after the email | LinkedIn invite, no note by default (note if Premium or hand-picked) | Investor has `linkedin_url` and account is connected | Founder approves the batch |
| After acceptance, plus 2 to 24 hours | LinkedIn message, short, references the email | No reply on any channel yet | Founder approves, Claude drafts |
| 3 (founder setting) | Email follow-up (existing) | No reply | Existing |
| 7 to 10 | Optional second LinkedIn message | Connected, no reply | Founder approves |
| Any time | WhatsApp | Only with recorded consent and not DNC | Always manual |
| On any reply | Stop all pending steps | | |

Claude drafts for LinkedIn and WhatsApp should reuse `HOUSE_STYLE` in `supabase/functions/_shared/claude.ts`, with length limits of 300 characters (paid) or 200 (free) for invite notes.

### 5.7 Rough monthly cost per founder

| Item | Cost | Notes |
| --- | --- | --- |
| Unipile LinkedIn account | 5 EUR (11 to 50 accounts), 4 EUR (51 to 1,000) | 49 EUR flat covers the first 10 accounts in total |
| Unipile WhatsApp account (optional) | Same again | Only for founders who enable it |
| Edge function and database load | Negligible at these volumes | Within existing Supabase plan |
| Claude drafting for LinkedIn and WhatsApp | Small; a few hundred short drafts per month | Existing Claude usage |
| LinkedIn Premium or Sales Navigator | Paid by the founder, optional | Needed for unlimited invite notes and InMail |
| **Total to Centrale** | **About 4 to 10 EUR per founder per month** | Versus 60 to 110 USD per founder on campaign tools, or 49 to 74 USD on Linked API |

For comparison, a WhatsApp Business Platform setup would add about 49 EUR per number per month on 360dialog (or Twilio's 0.005 USD per message), plus Meta fees of roughly 0.05 to 0.064 USD per UK marketing template, and from 1 October 2026 possibly per-message charges on service replies beyond a free allowance.

### 5.8 Rollout

1. Pilot with 5 to 10 founders on the 49 EUR tier, LinkedIn only, invites without notes, all steps founder-approved.
2. Measure acceptance rate, restriction events and reconnect frequency per account for four weeks before raising caps.
3. Add WhatsApp as a manual, consent-gated reply channel once the inbox handles LinkedIn well.
4. Get the legal questions in 4.5 answered before general availability.
