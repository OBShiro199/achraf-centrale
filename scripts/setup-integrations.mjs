#!/usr/bin/env node
// One-time setup for LinkedIn and WhatsApp (Unipile API v2) and calling (Telnyx). Safe to run again: it reuses what
// already exists. Prints the values to store in Supabase Vault (Dashboard > Project settings > Vault).
//
//   UNIPILE_API_KEY=... TELNYX_API_KEY=KEY... node scripts/setup-integrations.mjs
//
// UNIPILE_API_KEY must be a Service Key of the Unipile application (only those can manage webhooks). The webhook
// endpoint's signing secret is printed once: store it as UNIPILE_WEBHOOK_SECRET.
//
// Either half can be skipped by leaving its keys unset. Keep keys out of the repo and shell history files
// (prefix the command with a space, or export them from a password manager).
const FUNCTIONS = "https://tldvqiqucfmlnkgxaufy.supabase.co/functions/v1";
const out = {};

async function unipileSetup() {
  const { UNIPILE_API_KEY: key } = process.env;
  if (!key) return console.log("Unipile: skipped (set UNIPILE_API_KEY, an application Service Key)");
  const api = async (path, init = {}) => {
    const res = await fetch(`https://api.unipile.com${path}`, { ...init, headers: { "X-API-KEY": key, "Content-Type": "application/json", accept: "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Unipile ${path} ${res.status}: ${JSON.stringify(body)}`);
    return body;
  };
  const url = `${FUNCTIONS}/unipile-webhook`;
  const existing = (await api("/v2/webhooks/endpoints/").catch(() => ({ items: [] }))).items ?? [];
  if (existing.some((e) => e.url === url)) {
    console.log("Unipile: webhook endpoint already exists. Its signing secret is shown in the Unipile dashboard, Webhooks.");
    return;
  }
  const created = await api("/v2/webhooks/endpoints/", {
    method: "POST",
    body: JSON.stringify({
      url,
      description: "Centrale",
      trigger_events: [
        "account.add", "account.reconnect", "account.remove",
        "account.status.running", "account.status.disconnected", "account.status.errored",
        "relation.new", "message.new",
      ],
    }),
  });
  console.log("Unipile: created the webhook endpoint");
  Object.assign(out, { UNIPILE_WEBHOOK_SECRET: created.secret });
}

async function telnyxSetup() {
  const key = process.env.TELNYX_API_KEY;
  if (!key) return console.log("Telnyx: skipped (set TELNYX_API_KEY)");
  const api = async (path, init = {}) => {
    const res = await fetch(`https://api.telnyx.com/v2${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Telnyx ${path} ${res.status}: ${JSON.stringify(body.errors ?? body)}`);
    return body;
  };

  // Where founders may call, a daily spend cap, and no more than 2 calls a day to the same number.
  // Telnyx may ignore the name filter, so match the name here (never reuse another product's profile).
  let profile = (await api("/outbound_voice_profiles?page[size]=250")).data?.find((p) => p.name === "centrale");
  if (!profile) {
    profile = (await api("/outbound_voice_profiles", {
      method: "POST",
      body: JSON.stringify({
        name: "centrale",
        traffic_type: "conversational",
        service_plan: "global",
        whitelisted_destinations: ["US", "CA", "GB", "IE", "FR", "DE", "NL", "ES", "IT", "SE", "CH", "AE", "SG", "IL", "PT", "BE", "DK", "NO", "FI", "AU"],
        daily_spend_limit: "50.00",
        daily_spend_limit_enabled: true,
        max_destination_rate: 0.15,
      }),
    })).data;
    console.log("Telnyx: created outbound voice profile");
  } else console.log("Telnyx: outbound voice profile already exists");

  let conn = (await api("/credential_connections?page[size]=250")).data?.find((c) => c.connection_name === "centrale-browser");
  const password = crypto.randomUUID();
  const settings = {
    connection_name: "centrale-browser",
    active: true,
    anchorsite_override: "Latency",
    webhook_event_url: `${FUNCTIONS}/telnyx-webhook`,
    webhook_api_version: "2",
    webhook_timeout_secs: 25,
    outbound: { outbound_voice_profile_id: profile.id, call_parking_enabled: true },
  };
  if (!conn) {
    conn = (await api("/credential_connections", { method: "POST", body: JSON.stringify({ ...settings, user_name: `centrale${Date.now()}`, password }) })).data;
    console.log("Telnyx: created credential connection");
  } else {
    await api(`/credential_connections/${conn.id}`, { method: "PATCH", body: JSON.stringify(settings) });
    console.log("Telnyx: updated credential connection");
  }
  Object.assign(out, {
    TELNYX_API_KEY: "(the key you used)",
    TELNYX_CONNECTION_ID: conn.id,
    TELNYX_PUBLIC_KEY: "(Mission Control > Account settings > Keys & credentials > Public key)",
  });
}

await unipileSetup();
await telnyxSetup();
console.log("\nStore these in Supabase Vault:");
for (const [k, v] of Object.entries(out)) console.log(`  ${k} = ${v}`);
console.log("  PORKBUN_API_KEY, PORKBUN_SECRET_KEY = from porkbun.com/account/api (key with purchase permission)");
