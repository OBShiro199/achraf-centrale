#!/usr/bin/env node
// One-time setup for LinkedIn and WhatsApp (Unipile) and calling (Telnyx). Safe to run again: it reuses what
// already exists. Prints the values to store in Supabase Vault (Dashboard > Project settings > Vault).
//
//   UNIPILE_DSN=api12.unipile.com:14215 UNIPILE_API_KEY=... UNIPILE_WEBHOOK_SECRET=<any long random string> \
//   TELNYX_API_KEY=KEY... \
//     node scripts/setup-integrations.mjs
//
// Either half can be skipped by leaving its keys unset. Keep keys out of the repo and shell history files
// (prefix the command with a space, or export them from a password manager).
const FUNCTIONS = "https://tldvqiqucfmlnkgxaufy.supabase.co/functions/v1";
const out = {};

async function unipileSetup() {
  const { UNIPILE_DSN: dsn, UNIPILE_API_KEY: key, UNIPILE_WEBHOOK_SECRET: secret } = process.env;
  if (!dsn || !key) return console.log("Unipile: skipped (set UNIPILE_DSN and UNIPILE_API_KEY)");
  if (!secret || secret.length < 24) throw new Error("Set UNIPILE_WEBHOOK_SECRET to a random string of 24+ characters");
  const base = `https://${dsn.replace(/^https?:\/\//, "")}`;
  const api = async (path, init = {}) => {
    const res = await fetch(`${base}${path}`, { ...init, headers: { "X-API-KEY": key, "Content-Type": "application/json", accept: "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Unipile ${path} ${res.status}: ${JSON.stringify(body)}`);
    return body;
  };
  const url = `${FUNCTIONS}/unipile-webhook`;
  const existing = (await api("/api/v1/webhooks")).items ?? [];
  const headers = [{ key: "Content-Type", value: "application/json" }, { key: "Unipile-Auth", value: secret }];
  const wanted = [
    { name: "centrale-messages", source: "messaging", events: ["message_received"] },
    { name: "centrale-accounts", source: "account_status" },
    { name: "centrale-relations", source: "users", events: ["new_relation"] },
  ];
  for (const w of wanted) {
    if (existing.some((e) => e.name === w.name || (e.request_url === url && e.source === w.source))) {
      console.log(`Unipile: webhook ${w.name} already exists`);
      continue;
    }
    await api("/api/v1/webhooks", { method: "POST", body: JSON.stringify({ ...w, request_url: url, format: "json", headers }) });
    console.log(`Unipile: created webhook ${w.name}`);
  }
  Object.assign(out, { UNIPILE_DSN: dsn, UNIPILE_API_KEY: "(the key you used)", UNIPILE_WEBHOOK_SECRET: "(the secret you used)" });
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
  let profile = (await api("/outbound_voice_profiles?filter[name]=centrale")).data?.[0];
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

  let conn = (await api("/credential_connections?filter[connection_name][contains]=centrale")).data?.[0];
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
  // Telnyx only dials out (POST /calls) through a Call Control Application, never a credential connection. The
  // investor leg goes through this app; browsers keep logging in through the credential connection above.
  let app = (await api("/call_control_applications?filter[application_name][contains]=centrale")).data?.[0];
  const appSettings = {
    application_name: "centrale-calls",
    active: true,
    anchorsite_override: "Latency",
    webhook_event_url: `${FUNCTIONS}/telnyx-webhook`,
    webhook_api_version: "2",
    webhook_timeout_secs: 25,
    outbound: { outbound_voice_profile_id: profile.id },
  };
  if (!app) {
    app = (await api("/call_control_applications", { method: "POST", body: JSON.stringify(appSettings) })).data;
    console.log("Telnyx: created call control application");
  } else {
    await api(`/call_control_applications/${app.id}`, { method: "PATCH", body: JSON.stringify(appSettings) });
    console.log("Telnyx: updated call control application");
  }
  Object.assign(out, {
    TELNYX_API_KEY: "(the key you used)",
    TELNYX_CONNECTION_ID: conn.id,
    TELNYX_CALL_CONTROL_APP_ID: app.id,
    TELNYX_PUBLIC_KEY: "(Mission Control > Account settings > Keys & credentials > Public key)",
  });
}

await unipileSetup();
await telnyxSetup();
console.log("\nStore these in Supabase Vault:");
for (const [k, v] of Object.entries(out)) console.log(`  ${k} = ${v}`);
console.log("  PORKBUN_API_KEY, PORKBUN_SECRET_KEY = from porkbun.com/account/api (key with purchase permission)");
