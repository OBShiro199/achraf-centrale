// Receives Telnyx call events for the credential connection founders dial through.
//
// How a call runs (Telnyx's "parked" pattern, so the server, not the browser, decides who is called and from which
// number):
//   1. The founder presses Call. The app records the call with phone {action:"start"}, then the browser dials.
//   2. call.initiated (browser leg, parked): find the founder by SIP username and the matching start from the last
//      few minutes; anything else is hung up. Dial the investor from the founder's own number, recording from answer.
//   3. call.answered (investor leg): play "This call may be recorded" to the investor (all-party consent states and
//      the UK expect notice), then answer the browser leg and bridge the two.
//   4. call.hangup on either leg ends the other and records how the call ended.
//   5. call.recording.saved: copy the recording into storage (Telnyx links last 10 minutes), transcribe it, and let
//      Claude summarise and tag the outcome.
import { admin, background, json, serve } from "../_shared/core.ts";
import { telnyx, verifyTelnyxSignature, clientState, readClientState, telnyxKey } from "../_shared/telnyx.ts";
import { connectionId } from "../_shared/phone.ts";
import { tagOutcome, touchConversation } from "../_shared/unibox.ts";
import { CHANNEL_COSTS, recordSpend } from "../_shared/spend.ts";

interface TelnyxEvent {
  data: {
    id: string;
    event_type: string;
    occurred_at: string;
    payload: {
      call_control_id: string;
      call_leg_id?: string;
      call_session_id?: string;
      connection_id?: string;
      direction?: "incoming" | "outgoing";
      from?: string;
      to?: string;
      sip_username?: string;
      client_state?: string | null;
      hangup_cause?: string;
      result?: string;
      recording_urls?: { mp3?: string; wav?: string };
      start_time?: string;
      end_time?: string;
    };
  };
}

interface State {
  call_id: string;
  leg: "investor" | "browser";
  browser: string;
  step?: "notice";
}

const RECORDING_NOTICE = "Hello. This call may be recorded.";
const digits = (s: string | undefined) => (s ?? "").replace(/^sip:/, "").replace(/@.*$/, "").replace(/\D/g, "");

async function action(ccid: string, name: string, body: Record<string, unknown> = {}) {
  return await telnyx(`/calls/${encodeURIComponent(ccid)}/actions/${name}`, { body }).catch((err) => {
    // A leg that already hung up answers 422; nothing to do.
    console.warn(`telnyx ${name} failed`, err instanceof Error ? err.message : err);
    return null;
  });
}

/** Transcribes a recording with Telnyx's speech-to-text (Deepgram Nova 3). */
async function transcribe(url: string) {
  const form = new FormData();
  form.append("model", "deepgram/nova-3");
  form.append("file_url", url);
  form.append("response_format", "json");
  const res = await fetch("https://api.telnyx.com/v2/ai/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${await telnyxKey()}` }, body: form });
  if (!res.ok) throw new Error(`Transcription failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { text?: string }).text?.trim() ?? "";
}

/** Copies a recording into storage (Telnyx links last 10 minutes), transcribes it, and has Claude summarise and tag it. */
async function saveRecording(callId: string, url: string) {
  const { data: call } = await admin.from("calls").select("id, owner_id, investor_id, to_number, investor:investors_achraf(full_name)").eq("id", callId).maybeSingle();
  if (!call) return;
  const audio = await fetch(url);
  if (audio.ok) {
    const path = `${call.owner_id}/${call.id}.mp3`;
    await admin.storage.from("call-recordings").upload(path, await audio.arrayBuffer(), { contentType: "audio/mpeg", upsert: true });
    await admin.from("calls").update({ recording_path: path }).eq("id", call.id);
  }
  const transcript = await transcribe(url).catch((err) => {
    console.error(err);
    return "";
  });
  // deno-lint-ignore no-explicit-any
  const name = (call.investor as any)?.full_name ?? call.to_number;
  const convo = await touchConversation({
    owner_id: call.owner_id, channel: "phone", external_id: call.to_number, investor_id: call.investor_id,
    contact_name: name, contact_handle: call.to_number, preview: transcript ? `Call: ${transcript.slice(0, 200)}` : "Call recorded", direction: "outbound",
  });
  await admin.from("calls").update({ transcript, conversation_id: convo }).eq("id", call.id);
  if (transcript.length > 40) {
    await tagOutcome({ owner_id: call.owner_id, conversation_id: convo, investor_id: call.investor_id, channel: "phone", text: transcript, call_id: call.id });
  }
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const raw = await req.text();
  if (!(await verifyTelnyxSignature(raw, req.headers))) return json({ error: "Invalid signature" }, 401);
  const { data: ev } = JSON.parse(raw) as TelnyxEvent;
  const { data: fresh } = await admin.rpc("claim_webhook_event", { p_event_id: `telnyx:${ev.id}` });
  if (!fresh) return json({ ok: true, duplicate: true });

  const p = ev.payload;
  const state = readClientState<State>(p.client_state);

  switch (ev.event_type) {
    case "call.initiated": {
      // Our own investor legs carry client_state; anything else here is a browser leg, parked.
      if (state) return json({ ok: true });
      // A browser leg, parked. Whose credential is it, and did they just press Call for this number?
      const sip = p.sip_username ?? (p.from ?? "").replace(/^sip:/, "").replace(/@.*$/, "");
      const { data: number } = await admin.from("phone_numbers").select("id, owner_id, e164").eq("sip_username", sip).eq("status", "active").maybeSingle();
      const to = digits(p.to);
      const { data: call } = number
        ? await admin.from("calls").select("id, to_number").eq("owner_id", number.owner_id).eq("status", "dialing").is("telnyx_call_leg_id", null)
          .gte("started_at", new Date(Date.now() - 180_000).toISOString()).order("started_at", { ascending: false }).limit(5)
          .then((r) => ({ data: (r.data ?? []).find((c) => digits(c.to_number) === to) ?? null }))
        : { data: null };
      if (!number || !call) {
        await action(p.call_control_id, "hangup");
        return json({ ok: true, rejected: number ? "no matching start" : "unknown credential" });
      }
      await admin.from("calls").update({ telnyx_call_leg_id: p.call_control_id, status: "ringing" }).eq("id", call.id);
      const s: State = { call_id: call.id, leg: "investor", browser: p.call_control_id };
      const dialled = await telnyx<{ data: { call_session_id?: string; call_control_id?: string } }>("/calls", {
        body: {
          connection_id: await connectionId(),
          to: call.to_number,
          from: number.e164,
          link_to: p.call_control_id,
          timeout_secs: 40,
          record: "record-from-answer",
          record_channels: "dual",
          record_format: "mp3",
          answering_machine_detection: "premium",
          client_state: clientState(s),
        },
      }).catch(async (err) => {
        await admin.from("calls").update({ status: "failed", ended_at: new Date().toISOString() }).eq("id", call.id);
        await action(p.call_control_id, "hangup");
        throw err;
      });
      await admin.from("calls").update({ telnyx_call_session_id: dialled.data?.call_session_id ?? null, telnyx_investor_leg_id: dialled.data?.call_control_id ?? null }).eq("id", call.id);
      return json({ ok: true });
    }

    case "call.answered": {
      if (state?.leg !== "investor") return json({ ok: true });
      await admin.from("calls").update({ status: "answered", answered_at: ev.occurred_at }).eq("id", state.call_id);
      await action(p.call_control_id, "speak", {
        payload: RECORDING_NOTICE, voice: "female", language: "en-US", client_state: clientState({ ...state, step: "notice" }),
      });
      return json({ ok: true });
    }

    case "call.speak.ended": {
      if (state?.leg !== "investor" || state.step !== "notice") return json({ ok: true });
      const { data: live } = await admin.from("calls").select("status").eq("id", state.call_id).maybeSingle();
      if (live?.status !== "answered") {
        await action(p.call_control_id, "hangup");
        return json({ ok: true });
      }
      await action(state.browser, "answer", { client_state: clientState({ ...state, leg: "browser" }) });
      await action(p.call_control_id, "bridge", { call_control_id: state.browser });
      return json({ ok: true });
    }

    case "call.machine.premium.detection.ended": {
      if (state?.leg === "investor" && /machine/i.test(p.result ?? "")) {
        await admin.from("calls").update({ outcome: "voicemail", outcome_source: "ai" }).eq("id", state.call_id).is("outcome_source", null);
      }
      return json({ ok: true });
    }

    case "call.hangup": {
      if (!state) {
        // The founder hung up the browser leg before or during the call: end the investor leg too.
        const { data: call } = await admin.from("calls").select("id, status, telnyx_investor_leg_id").eq("telnyx_call_leg_id", p.call_control_id).maybeSingle();
        if (call?.telnyx_investor_leg_id && (call.status === "dialing" || call.status === "ringing" || call.status === "answered")) {
          await action(call.telnyx_investor_leg_id, "hangup");
        }
        if (call && (call.status === "dialing" || call.status === "ringing")) {
          await admin.from("calls").update({ status: "no_answer", ended_at: ev.occurred_at }).eq("id", call.id);
        }
        return json({ ok: true });
      }
      if (state.leg === "browser") return json({ ok: true });
      const { data: call } = await admin.from("calls").select("answered_at, outcome_source, status").eq("id", state.call_id).maybeSingle();
      if (call?.status === "no_answer" && !call.answered_at) return json({ ok: true });
      const cause = p.hangup_cause ?? "";
      const status = call?.answered_at ? "completed" : cause === "user_busy" ? "busy" : /timeout|no_answer|originator_cancel|normal_clearing/.test(cause) ? "no_answer" : "failed";
      const duration = call?.answered_at ? Math.max(0, Math.round((Date.parse(ev.occurred_at) - Date.parse(call.answered_at)) / 1000)) : 0;
      await admin.from("calls").update({
        status, ended_at: ev.occurred_at, duration_seconds: duration,
        ...(status === "no_answer" && !call?.outcome_source ? { outcome: "no_answer", outcome_source: "ai" } : {}),
      }).eq("id", state.call_id);
      await action(state.browser, "hangup");
      // Billed per started minute; transcription only runs on answered calls.
      const minutes = Math.ceil(duration / 60);
      const { data: owner } = await admin.from("calls").select("owner_id").eq("id", state.call_id).maybeSingle();
      await recordSpend({ owner: owner?.owner_id ?? null, feature: "call_minutes", ref: state.call_id }, {
        usd: CHANNEL_COSTS.answering_machine_usd + minutes * (CHANNEL_COSTS.call_usd_per_minute + CHANNEL_COSTS.transcription_usd_per_minute) + (minutes ? 0 : 0.01),
      });
      return json({ ok: true });
    }

    case "call.recording.saved": {
      if (state?.leg !== "investor" || !p.recording_urls?.mp3) return json({ ok: true });
      background(saveRecording(state.call_id, p.recording_urls.mp3).catch((err) => console.error("recording follow-up failed", state.call_id, err)));
      return json({ ok: true });
    }
  }
  return json({ ok: true, ignored: ev.event_type });
});
