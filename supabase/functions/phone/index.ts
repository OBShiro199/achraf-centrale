// Calling for the signed-in founder.
// Actions:
//   status                          the founder's number and whether calling is configured
//   provision  { area_code? }       buy the founder's US number (also done during onboarding)
//   token                           a 24-hour login token for the browser phone (@telnyx/webrtc)
//   start      { investor_id }      record that the founder is about to dial this investor; the call webhook only
//                                   connects calls that match a start from the last few minutes
//   calls      { investor_id? }     recent calls with outcome, summary and transcript
//   recording  { call_id }          a short-lived link to the call recording
//   tag        { call_id, outcome, notes? }  the founder's own outcome, which also moves the pipeline
import { admin, HttpError, json, readJson, requireUser, secret, serve } from "../_shared/core.ts";
import { investorId, loadInvestorContact } from "../_shared/investor.ts";
import { sendingAllowance } from "../_shared/inbox.ts";
import { provisionNumber } from "../_shared/phone.ts";
import { telnyx } from "../_shared/telnyx.ts";
import { OUTCOMES, type Outcome } from "../_shared/unibox.ts";

/** Calls a founder can start in a day; protects the number's reputation (carriers label numbers that dial a lot). */
const DAILY_CALLS = 60;

interface Body {
  action?: "status" | "provision" | "token" | "start" | "calls" | "recording" | "tag";
  area_code?: string;
  investor_id?: number | string;
  call_id?: string;
  outcome?: Outcome;
  notes?: string;
}

serve(async (req) => {
  const user = await requireUser(req);
  const input = await readJson<Body>(req);
  const number = async () =>
    (await admin.from("phone_numbers").select("id, e164, status, telnyx_credential_id").eq("owner_id", user.id).in("status", ["ordering", "active"]).maybeSingle()).data;

  switch (input.action ?? "status") {
    case "status": {
      const configured = Boolean(await secret("TELNYX_CONNECTION_ID").catch(() => null));
      const n = await number();
      return json({ configured, number: n ? { e164: n.e164, status: n.status } : null });
    }

    case "provision": {
      if (!(await sendingAllowance(user.id)).can_send) throw new HttpError(402, "Your US number comes with your trial or plan. Start one from Billing.");
      const n = await provisionNumber(user.id, input.area_code);
      return json({ number: { e164: n.e164, status: n.status } });
    }

    case "token": {
      const n = await number();
      if (!n || n.status !== "active" || !n.telnyx_credential_id) throw new HttpError(409, "Set up your US number first, in Settings under Channels.");
      const token = await telnyx<string>(`/telephony_credentials/${n.telnyx_credential_id}/token`, { method: "POST", text: true });
      return json({ token, from: n.e164 });
    }

    case "start": {
      if (!(await sendingAllowance(user.id)).can_send) throw new HttpError(402, "Calling needs a trial or a plan. Start one from Billing.");
      const n = await number();
      if (!n || n.status !== "active") throw new HttpError(409, "Set up your US number first, in Settings under Channels.");
      const contact = await loadInvestorContact(investorId(input.investor_id));
      if (!contact.phone) throw new HttpError(422, `We do not have a phone number for ${contact.full_name}.`);
      const { count } = await admin.from("calls").select("id", { count: "exact", head: true }).eq("owner_id", user.id).gte("started_at", new Date(Date.now() - 86_400_000).toISOString());
      if ((count ?? 0) >= DAILY_CALLS) throw new HttpError(429, `You have made ${DAILY_CALLS} calls in the last 24 hours. Carriers flag numbers that dial much more, so the rest wait until tomorrow.`);
      const { data: call, error } = await admin.from("calls").insert({
        owner_id: user.id, investor_id: contact.id, phone_number_id: n.id, from_number: n.e164, to_number: contact.phone, status: "dialing",
      }).select("id").single();
      if (error) throw error;
      await admin.from("pipeline").upsert({ owner_id: user.id, investor_id: contact.id, stage: "contacted" }, { onConflict: "owner_id,investor_id", ignoreDuplicates: true });
      return json({ call_id: call.id, to: contact.phone, from: n.e164, name: contact.full_name, firm: contact.firm });
    }

    case "calls": {
      let q = admin.from("calls")
        .select("id, investor_id, to_number, status, started_at, answered_at, duration_seconds, outcome, outcome_source, summary, transcript, notes, recording_path, investor:investors_achraf(full_name, firm)")
        .eq("owner_id", user.id).order("started_at", { ascending: false }).limit(50);
      if (input.investor_id) q = q.eq("investor_id", investorId(input.investor_id));
      const { data } = await q;
      return json({ calls: (data ?? []).map((c) => ({ ...c, has_recording: Boolean(c.recording_path), recording_path: undefined })) });
    }

    case "recording": {
      const { data: call } = await admin.from("calls").select("recording_path").eq("id", input.call_id ?? "").eq("owner_id", user.id).maybeSingle();
      if (!call?.recording_path) throw new HttpError(404, "This call has no recording");
      const { data, error } = await admin.storage.from("call-recordings").createSignedUrl(call.recording_path, 300);
      if (error) throw error;
      return json({ url: data.signedUrl });
    }

    case "tag": {
      if (!input.outcome || !OUTCOMES.includes(input.outcome)) throw new HttpError(400, "Pick an outcome");
      const { data: call } = await admin.from("calls").update({
        outcome: input.outcome, outcome_source: "founder", ...(input.notes !== undefined ? { notes: input.notes.slice(0, 5000) } : {}),
      }).eq("id", input.call_id ?? "").eq("owner_id", user.id).select("investor_id, conversation_id").maybeSingle();
      if (!call) throw new HttpError(404, "Call not found");
      if (call.conversation_id) await admin.from("conversations").update({ outcome: input.outcome, outcome_source: "founder" }).eq("id", call.conversation_id);
      await admin.rpc("advance_pipeline", { p_owner: user.id, p_investor: call.investor_id, p_outcome: input.outcome });
      return json({ ok: true });
    }
  }
  throw new HttpError(400, "Unknown action");
});
