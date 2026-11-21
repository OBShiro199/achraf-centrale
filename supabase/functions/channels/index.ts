// LinkedIn and WhatsApp for the signed-in founder, through their own accounts connected at Unipile.
// Actions:
//   status                                   connected accounts and today's usage against the daily limits
//   connect     { provider }                 a link to Unipile's hosted wizard (LinkedIn sign-in or WhatsApp QR code)
//   disconnect  { provider }                 remove the account from Unipile and from Centrale
//   draft       { investor_id, channel }     Claude writes a short LinkedIn note or WhatsApp message
//   send        { investor_id, channel, text }
//               LinkedIn: a message if they are a connection, otherwise a connection invite with the text as its note.
//               WhatsApp: a message to the investor's mobile number.
//   reply       { conversation_id, text }    answer in an existing LinkedIn or WhatsApp conversation
//   messages    { conversation_id }          the conversation's messages, oldest first
//   tag         { conversation_id, outcome } the founder's own outcome for any conversation (email included); moves the pipeline
import { admin, HttpError, json, readJson, requireUser, secret, serve, SUPABASE_URL } from "../_shared/core.ts";
import { HOUSE_STYLE, structured, tidy } from "../_shared/claude.ts";
import { investorId, loadInvestorContact } from "../_shared/investor.ts";
import { outreachContext } from "../_shared/context.ts";
import { sendingAllowance } from "../_shared/inbox.ts";
import { friendlyUnipileError, linkedinIdentifier, unipile, unipileBase, UnipileError, whatsappId } from "../_shared/unipile.ts";
import { OUTCOMES, touchConversation, type Outcome } from "../_shared/unibox.ts";

type Provider = "linkedin" | "whatsapp";

/**
 * Daily limits per founder, well inside what Unipile reports LinkedIn and WhatsApp tolerate, because the risk
 * falls on the founder's own account. New WhatsApp chats are the most sensitive: WhatsApp restricts accounts that
 * start many chats nobody answers.
 */
export const DAILY_LIMITS = { linkedin_invites: 20, linkedin_messages: 50, whatsapp_new_chats: 15, whatsapp_messages: 60 };
const INVITE_NOTE_MAX = 300;

interface Body {
  action?: "status" | "connect" | "disconnect" | "draft" | "send" | "reply" | "messages" | "tag";
  outcome?: Outcome | null;
  provider?: Provider;
  channel?: Provider;
  investor_id?: number | string;
  conversation_id?: string;
  text?: string;
}

const isProvider = (p: unknown): p is Provider => p === "linkedin" || p === "whatsapp";
const sinceMidnight = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
};

async function usageToday(ownerId: string) {
  const { data } = await admin
    .from("channel_messages")
    .select("kind, conversation:conversations!inner(channel, created_at)")
    .eq("owner_id", ownerId)
    .eq("direction", "outbound")
    .gte("sent_at", sinceMidnight());
  const rows = (data ?? []) as unknown as { kind: string; conversation: { channel: string; created_at: string } }[];
  const today = sinceMidnight();
  return {
    linkedin_invites: rows.filter((r) => r.conversation.channel === "linkedin" && r.kind === "invite").length,
    linkedin_messages: rows.filter((r) => r.conversation.channel === "linkedin" && r.kind !== "invite").length,
    whatsapp_new_chats: rows.filter((r) => r.conversation.channel === "whatsapp" && r.conversation.created_at >= today).length,
    whatsapp_messages: rows.filter((r) => r.conversation.channel === "whatsapp").length,
  };
}

async function activeAccount(ownerId: string, provider: Provider) {
  const { data } = await admin.from("channel_accounts").select("*").eq("owner_id", ownerId).eq("provider", provider).neq("status", "disconnected").maybeSingle();
  const name = provider === "linkedin" ? "LinkedIn" : "WhatsApp";
  if (!data) throw new HttpError(409, `Connect your ${name} account first, in Settings under Channels.`);
  if (data.status !== "ok") throw new HttpError(409, `Your ${name} account needs reconnecting. Go to Settings, Channels.`);
  return data as { id: string; unipile_account_id: string };
}

async function record(ownerId: string, conversationId: string, kind: "message" | "invite", text: string, externalId: string | null) {
  await admin.from("channel_messages").upsert(
    { owner_id: ownerId, conversation_id: conversationId, direction: "outbound", kind, body: text, external_id: externalId },
    { onConflict: "external_id", ignoreDuplicates: true },
  );
}

serve(async (req) => {
  const user = await requireUser(req);
  const input = await readJson<Body>(req);

  switch (input.action ?? "status") {
    case "status": {
      const [{ data: accounts }, usage] = await Promise.all([
        admin.from("channel_accounts").select("provider, status, display_name, status_message, connected_at").eq("owner_id", user.id).neq("status", "disconnected"),
        usageToday(user.id),
      ]);
      const configured = Boolean(await secret("UNIPILE_DSN").catch(() => null));
      return json({ configured, accounts: accounts ?? [], usage, limits: DAILY_LIMITS });
    }

    case "connect": {
      if (!isProvider(input.provider)) throw new HttpError(400, "Pick LinkedIn or WhatsApp");
      const { data: existing } = await admin.from("channel_accounts").select("unipile_account_id, status").eq("owner_id", user.id).eq("provider", input.provider)
        .neq("status", "disconnected").maybeSingle();
      const app = (await secret("APP_URL").catch(() => "https://www.centralegtm.com")).replace(/\/$/, "");
      const hookSecret = await secret("UNIPILE_WEBHOOK_SECRET");
      const reconnect = existing?.unipile_account_id && existing.status !== "ok";
      // Links expire at Unipile's daily restart anyway; an hour is plenty to finish the wizard.
      const link = await unipile<{ url: string }>("/api/v1/hosted/accounts/link", {
        json: {
          type: reconnect ? "reconnect" : "create",
          ...(reconnect ? { reconnect_account: existing.unipile_account_id } : { providers: [input.provider.toUpperCase()] }),
          api_url: await unipileBase(),
          expiresOn: new Date(Date.now() + 3_600_000).toISOString(),
          name: `${user.id}:${input.provider}`,
          notify_url: `${SUPABASE_URL}/functions/v1/unipile-webhook?secret=${encodeURIComponent(hookSecret)}`,
          success_redirect_url: `${app}/dashboard/settings?channel=${input.provider}&connected=1#channels`,
          failure_redirect_url: `${app}/dashboard/settings?channel=${input.provider}&connected=0#channels`,
          disabled_features: ["linkedin_recruiter", "linkedin_organizations_mailboxes"],
        },
      });
      return json({ url: link.url });
    }

    case "disconnect": {
      if (!isProvider(input.provider)) throw new HttpError(400, "Pick LinkedIn or WhatsApp");
      const { data: acct } = await admin.from("channel_accounts").select("id, unipile_account_id").eq("owner_id", user.id).eq("provider", input.provider)
        .neq("status", "disconnected").maybeSingle();
      if (!acct) return json({ ok: true });
      // Unipile bills on accounts linked, so remove it there first.
      if (acct.unipile_account_id) {
        await unipile(`/api/v1/accounts/${acct.unipile_account_id}`, { method: "DELETE" }).catch((err) => {
          if (!(err instanceof UnipileError && err.status === 404)) throw err;
        });
      }
      await admin.from("channel_accounts").update({ status: "disconnected" }).eq("id", acct.id);
      return json({ ok: true });
    }

    case "draft": {
      if (!isProvider(input.channel)) throw new HttpError(400, "Pick LinkedIn or WhatsApp");
      const { investor, firstName, context } = await outreachContext(user.id, investorId(input.investor_id));
      const linkedin = input.channel === "linkedin";
      const draft = await structured<{ text: string }>({
        system: linkedin
          ? `You write LinkedIn connection notes from startup founders to investors. At most 280 characters including spaces. One or two sentences: who the founder is, the single strongest overlap with this investor, and a light ask to connect. No greeting line beyond their first name, no links, no hashtags. Never invent facts. ${HOUSE_STYLE}`
          : `You write a first WhatsApp message from a startup founder to an investor. 40 to 70 words, conversational, as one person texting another: say who they are and how they got the number is not mentioned. Name the single strongest overlap with this investor and ask whether a short call is worth it. Sign with the founder's first name. No links unless a booking link is given. Never invent facts. ${HOUSE_STYLE}`,
        content: [{ type: "text", text: `${context}\n\nWrite the ${linkedin ? "connection note" : "WhatsApp message"} from ${firstName} to ${investor.full_name}.` }],
        schema: { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } },
        effort: "low",
        maxTokens: 1500,
        track: { owner: user.id, feature: linkedin ? "linkedin_draft" : "whatsapp_draft" },
      });
      let text = tidy(draft.text);
      if (linkedin && text.length > INVITE_NOTE_MAX) text = text.slice(0, INVITE_NOTE_MAX - 1).replace(/\s+\S*$/, "") + ".";
      return json({ text });
    }

    case "send": {
      if (!isProvider(input.channel)) throw new HttpError(400, "Pick LinkedIn or WhatsApp");
      const text = input.text?.trim();
      if (!text) throw new HttpError(400, "Write a message first");
      const allowance = await sendingAllowance(user.id);
      if (!allowance.can_send) throw new HttpError(402, "Messaging needs a trial or a plan. Start one from Billing.");

      const [account, contact, usage] = await Promise.all([activeAccount(user.id, input.channel), loadInvestorContact(investorId(input.investor_id)), usageToday(user.id)]);
      const accountId = account.unipile_account_id;

      try {
        if (input.channel === "linkedin") {
          const identifier = linkedinIdentifier(contact.linkedin_url);
          if (!identifier) throw new HttpError(422, `We do not have a LinkedIn profile for ${contact.full_name}.`);
          const profile = await unipile<{ provider_id: string; network_distance?: string; is_relationship?: boolean; first_name?: string; last_name?: string }>(
            `/api/v1/users/${encodeURIComponent(identifier)}?account_id=${encodeURIComponent(accountId)}`,
          );
          const connected = profile.is_relationship === true || profile.network_distance === "FIRST_DEGREE" || profile.network_distance === "DISTANCE_1";

          if (connected) {
            if (usage.linkedin_messages >= DAILY_LIMITS.linkedin_messages) throw new HttpError(429, `You have sent ${DAILY_LIMITS.linkedin_messages} LinkedIn messages today. More tomorrow.`);
            const sent = await unipile<{ chat_id: string; message_id?: string }>("/api/v1/chats", { form: { account_id: accountId, text, attendees_ids: profile.provider_id } });
            const convo = await touchConversation({ owner_id: user.id, channel: "linkedin", external_id: sent.chat_id, investor_id: contact.id, contact_name: contact.full_name, contact_handle: profile.provider_id, preview: text, direction: "outbound" });
            await record(user.id, convo, "message", text, sent.message_id ?? null);
            return json({ ok: true, conversation_id: convo, kind: "message" });
          }

          if (usage.linkedin_invites >= DAILY_LIMITS.linkedin_invites) throw new HttpError(429, `You have sent ${DAILY_LIMITS.linkedin_invites} LinkedIn invites today, the safe limit. More tomorrow.`);
          if (text.length > INVITE_NOTE_MAX) throw new HttpError(400, `${contact.full_name} is not a connection yet, so this goes as an invite note, which holds ${INVITE_NOTE_MAX} characters. Shorten it.`);
          await unipile("/api/v1/users/invite", { json: { provider_id: profile.provider_id, account_id: accountId, message: text } });
          // Until they accept there is no chat; the webhook links the conversation to the chat on their first message.
          const convo = await touchConversation({ owner_id: user.id, channel: "linkedin", external_id: `invite:${profile.provider_id}`, investor_id: contact.id, contact_name: contact.full_name, contact_handle: profile.provider_id, preview: text, direction: "outbound" });
          await record(user.id, convo, "invite", text, null);
          await admin.from("pipeline").upsert({ owner_id: user.id, investor_id: contact.id, stage: "contacted" }, { onConflict: "owner_id,investor_id", ignoreDuplicates: true });
          return json({ ok: true, conversation_id: convo, kind: "invite" });
        }

        if (!contact.phone) throw new HttpError(422, `We do not have a mobile number for ${contact.full_name}.`);
        const attendee = whatsappId(contact.phone);
        const { data: open } = await admin.from("conversations").select("id").eq("owner_id", user.id).eq("channel", "whatsapp").eq("contact_handle", attendee).maybeSingle();
        if (!open && usage.whatsapp_new_chats >= DAILY_LIMITS.whatsapp_new_chats) {
          throw new HttpError(429, `You have started ${DAILY_LIMITS.whatsapp_new_chats} new WhatsApp chats today. WhatsApp restricts accounts that start many more, so the rest wait until tomorrow.`);
        }
        if (usage.whatsapp_messages >= DAILY_LIMITS.whatsapp_messages) throw new HttpError(429, `You have sent ${DAILY_LIMITS.whatsapp_messages} WhatsApp messages today. More tomorrow.`);
        const sent = await unipile<{ chat_id: string; message_id?: string }>("/api/v1/chats", { form: { account_id: accountId, text, attendees_ids: attendee } });
        const convo = await touchConversation({ owner_id: user.id, channel: "whatsapp", external_id: sent.chat_id, investor_id: contact.id, contact_name: contact.full_name, contact_handle: attendee, preview: text, direction: "outbound" });
        await record(user.id, convo, "message", text, sent.message_id ?? null);
        await admin.from("pipeline").upsert({ owner_id: user.id, investor_id: contact.id, stage: "contacted" }, { onConflict: "owner_id,investor_id", ignoreDuplicates: true });
        return json({ ok: true, conversation_id: convo, kind: "message" });
      } catch (err) {
        if (err instanceof UnipileError) throw new HttpError(err.status === 429 ? 429 : 422, friendlyUnipileError(err, input.channel));
        throw err;
      }
    }

    case "reply": {
      const text = input.text?.trim();
      if (!text) throw new HttpError(400, "Write a message first");
      const { data: convo } = await admin.from("conversations").select("*").eq("id", input.conversation_id ?? "").eq("owner_id", user.id).maybeSingle();
      if (!convo || (convo.channel !== "linkedin" && convo.channel !== "whatsapp")) throw new HttpError(404, "Conversation not found");
      if (String(convo.external_id).startsWith("invite:")) throw new HttpError(409, "They have not accepted your invite yet, so there is no chat to reply in.");
      const account = await activeAccount(user.id, convo.channel);
      try {
        const sent = await unipile<{ message_id?: string }>(`/api/v1/chats/${encodeURIComponent(convo.external_id)}/messages`, { form: { text } });
        await record(user.id, convo.id, "message", text, sent.message_id ?? null);
        await touchConversation({ owner_id: user.id, channel: convo.channel, external_id: convo.external_id, preview: text, direction: "outbound" });
        await admin.from("conversations").update({ unread: false }).eq("id", convo.id);
        return json({ ok: true, account: account.id });
      } catch (err) {
        if (err instanceof UnipileError) throw new HttpError(422, friendlyUnipileError(err, convo.channel));
        throw err;
      }
    }

    case "messages": {
      const { data: convo } = await admin.from("conversations").select("id").eq("id", input.conversation_id ?? "").eq("owner_id", user.id).maybeSingle();
      if (!convo) throw new HttpError(404, "Conversation not found");
      const { data } = await admin.from("channel_messages").select("id, direction, kind, body, sent_at, status").eq("conversation_id", convo.id).order("sent_at").limit(500);
      await admin.from("conversations").update({ unread: false }).eq("id", convo.id);
      return json({ messages: data ?? [] });
    }

    case "tag": {
      if (input.outcome !== null && (!input.outcome || !OUTCOMES.includes(input.outcome))) throw new HttpError(400, "Pick an outcome");
      const { data: convo } = await admin.from("conversations")
        .update({ outcome: input.outcome, outcome_source: input.outcome ? "founder" : null, outcome_reason: null })
        .eq("id", input.conversation_id ?? "").eq("owner_id", user.id).select("investor_id").maybeSingle();
      if (!convo) throw new HttpError(404, "Conversation not found");
      if (input.outcome) await admin.rpc("advance_pipeline", { p_owner: user.id, p_investor: convo.investor_id, p_outcome: input.outcome });
      return json({ ok: true });
    }
  }
  throw new HttpError(400, "Unknown action");
});
