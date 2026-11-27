// A founder's US phone number at Telnyx: bought into Centrale's Telnyx account, attached to the credential
// connection browsers dial through, with a SIP credential of its own so the webhook knows whose call it is.
// About $1 to buy and $1 a month; released when the founder's plan ends.
import { admin, HttpError, secret } from "./core.ts";
import { telnyx, TelnyxError } from "./telnyx.ts";
import { CHANNEL_COSTS, recordSpend } from "./spend.ts";

interface Available {
  phone_number: string;
}

export async function connectionId() {
  const id = await secret("TELNYX_CONNECTION_ID").catch(() => null);
  if (!id) throw new HttpError(503, "Calling is not set up yet. Run scripts/setup-integrations.mjs and add TELNYX_CONNECTION_ID to Supabase Vault.");
  return id;
}

/** The Call Control Application investor legs are dialled through: Telnyx refuses POST /calls on a credential connection. */
export async function callControlAppId() {
  const id = await secret("TELNYX_CALL_CONTROL_APP_ID").catch(() => null);
  if (!id) throw new HttpError(503, "Calling is not set up yet. Run scripts/setup-integrations.mjs and add TELNYX_CALL_CONTROL_APP_ID to Supabase Vault.");
  return id;
}

/** Buys a US local number for the founder, in their preferred area code when one is free. Returns the number row. */
export async function provisionNumber(ownerId: string, areaCode?: string | null) {
  const { data: current } = await admin.from("phone_numbers").select("*").eq("owner_id", ownerId).in("status", ["ordering", "active"]).maybeSingle();
  if (current?.status === "active") return current;
  if (current?.status === "ordering" && Date.now() - Date.parse(current.created_at) < 120_000) throw new HttpError(409, "Your number is being set up. Try again in a minute.");
  const conn = await connectionId();
  // An order that stopped half way may still have bought the number: finish setting that one up instead of buying another.
  if (current) {
    const owned = await numberId(current.e164);
    if (owned) return await finishNumber(ownerId, current.id, owned, conn);
    await admin.from("phone_numbers").update({ status: "failed", last_error: "Abandoned order" }).eq("id", current.id);
  }

  const filters = new URLSearchParams({
    "filter[country_code]": "US",
    "filter[phone_number_type]": "local",
    "filter[features][]": "voice",
    "filter[limit]": "5",
    "filter[exclude_held_numbers]": "true",
  });
  // Telnyx answers "no numbers" for an area code with an error (10031), not an empty list: fall back to any US number.
  const search = async (extra = "") =>
    (await telnyx<{ data: Available[] }>(`/available_phone_numbers?${filters}${extra}`).catch((err) => {
      if (extra && err instanceof TelnyxError && (err.code === "10031" || err.status === 400)) return { data: [] };
      throw err;
    })).data;
  let available = areaCode && /^\d{3}$/.test(areaCode) ? await search(`&filter[national_destination_code]=${areaCode}`) : [];
  if (!available.length) available = await search();
  if (!available.length) throw new HttpError(503, "No US numbers are available right now. Try again shortly.");

  const { data: row, error } = await admin.from("phone_numbers").insert({ owner_id: ownerId, e164: available[0].phone_number, status: "ordering" }).select().single();
  if (error) throw error;
  let ordered = false;
  try {
    const order = await telnyx<{ data: { id: string } }>("/number_orders", {
      body: { phone_numbers: [{ phone_number: available[0].phone_number }], connection_id: conn, customer_reference: `founder_${ownerId}` },
    });
    ordered = true;
    await admin.from("phone_numbers").update({ telnyx_order_id: order.data.id }).eq("id", row.id);
    await recordSpend({ owner: ownerId, feature: "phone_number", ref: row.id }, { usd: CHANNEL_COSTS.phone_number_setup_usd });
    // The order's line items have their own ids; the number's id (for release) comes from /phone_numbers.
    let id: string | null = null;
    for (let i = 0; i < 5 && !id; i++) {
      id = await numberId(available[0].phone_number);
      if (!id) await new Promise((r) => setTimeout(r, 1500));
    }
    return await finishNumber(ownerId, row.id, id, conn);
  } catch (err) {
    await admin.from("phone_numbers").update({ status: "failed", last_error: err instanceof Error ? err.message : String(err) }).eq("id", row.id);
    // Never keep paying for a number nobody can use.
    if (ordered) {
      const id = await numberId(available[0].phone_number);
      if (id) await telnyx(`/phone_numbers/${id}`, { method: "DELETE" }).catch((e) => console.error("could not release number after failed setup", e));
    }
    throw err instanceof TelnyxError ? new HttpError(502, `Could not set up your number: ${err.message}`) : err;
  }
}

/** The Telnyx id of a number on our account, or null. */
async function numberId(e164: string) {
  const found = await telnyx<{ data: { id: string }[] }>(`/phone_numbers?filter[phone_number]=${encodeURIComponent(e164)}`).catch(() => ({ data: [] }));
  return found.data[0]?.id ?? null;
}

/** Gives the founder a SIP credential for the number and marks it active. */
async function finishNumber(ownerId: string, rowId: string, telnyxNumberId: string | null, conn: string) {
  const cred = await telnyx<{ data: { id: string; sip_username: string } }>("/telephony_credentials", {
    body: { connection_id: conn, name: `founder-${ownerId}`, tag: ownerId },
  });
  const { data: done, error } = await admin.from("phone_numbers").update({
    status: "active",
    telnyx_number_id: telnyxNumberId,
    telnyx_credential_id: cred.data.id,
    sip_username: cred.data.sip_username,
    last_error: null,
  }).eq("id", rowId).select().single();
  if (error) throw error;
  return done;
}

/** Gives the number back to Telnyx and removes the founder's SIP credential. Safe to call twice. */
export async function releaseNumber(ownerId: string) {
  const { data: row } = await admin.from("phone_numbers").select("*").eq("owner_id", ownerId).eq("status", "active").maybeSingle();
  if (!row) return;
  let numberId = row.telnyx_number_id as string | null;
  if (!numberId) {
    const found = await telnyx<{ data: { id: string }[] }>(`/phone_numbers?filter[phone_number]=${encodeURIComponent(row.e164)}`).catch(() => ({ data: [] }));
    numberId = found.data[0]?.id ?? null;
  }
  const ignore404 = (err: unknown) => {
    if (!(err instanceof TelnyxError && err.status === 404)) throw err;
  };
  if (numberId) await telnyx(`/phone_numbers/${numberId}`, { method: "DELETE" }).catch(ignore404);
  if (row.telnyx_credential_id) await telnyx(`/telephony_credentials/${row.telnyx_credential_id}`, { method: "DELETE" }).catch(ignore404);
  await admin.from("phone_numbers").update({ status: "released", released_at: new Date().toISOString() }).eq("id", row.id);
}
