// A founder's US phone number at Telnyx: bought into Centrale's Telnyx account, attached to the credential
// connection browsers dial through, with a SIP credential of its own so the webhook knows whose call it is.
// About $1 to buy and $1 a month; released when the founder's plan ends.
import { admin, HttpError, secret } from "./core.ts";
import { telnyx, TelnyxError } from "./telnyx.ts";

interface Available {
  phone_number: string;
}

export async function connectionId() {
  const id = await secret("TELNYX_CONNECTION_ID").catch(() => null);
  if (!id) throw new HttpError(503, "Calling is not set up yet. Run scripts/setup-integrations.mjs and add TELNYX_CONNECTION_ID to Supabase Vault.");
  return id;
}

/** Buys a US local number for the founder, in their preferred area code when one is free. Returns the number row. */
export async function provisionNumber(ownerId: string, areaCode?: string | null) {
  const { data: current } = await admin.from("phone_numbers").select("*").eq("owner_id", ownerId).in("status", ["ordering", "active"]).maybeSingle();
  if (current?.status === "active") return current;
  if (current?.status === "ordering" && Date.now() - Date.parse(current.created_at) < 120_000) throw new HttpError(409, "Your number is being set up. Try again in a minute.");
  if (current) await admin.from("phone_numbers").update({ status: "failed", last_error: "Abandoned order" }).eq("id", current.id);

  const conn = await connectionId();
  const filters = new URLSearchParams({
    "filter[country_code]": "US",
    "filter[phone_number_type]": "local",
    "filter[features][]": "voice",
    "filter[limit]": "5",
    "filter[exclude_held_numbers]": "true",
  });
  let available = (await telnyx<{ data: Available[] }>(`/available_phone_numbers?${filters}${areaCode && /^\d{3}$/.test(areaCode) ? `&filter[national_destination_code]=${areaCode}` : ""}`)).data;
  if (!available.length && areaCode) available = (await telnyx<{ data: Available[] }>(`/available_phone_numbers?${filters}`)).data;
  if (!available.length) throw new HttpError(503, "No US numbers are available right now. Try again shortly.");

  const { data: row, error } = await admin.from("phone_numbers").insert({ owner_id: ownerId, e164: available[0].phone_number, status: "ordering" }).select().single();
  if (error) throw error;
  try {
    const order = await telnyx<{ data: { id: string; phone_numbers: { id?: string; phone_number: string }[] } }>("/number_orders", {
      body: { phone_numbers: [{ phone_number: available[0].phone_number }], connection_id: conn, customer_reference: `founder_${ownerId}` },
    });
    const cred = await telnyx<{ data: { id: string; sip_username: string } }>("/telephony_credentials", {
      body: { connection_id: conn, name: `founder-${ownerId}`, tag: ownerId },
    });
    const { data: done } = await admin.from("phone_numbers").update({
      status: "active",
      telnyx_order_id: order.data.id,
      telnyx_number_id: order.data.phone_numbers?.[0]?.id ?? null,
      telnyx_credential_id: cred.data.id,
      sip_username: cred.data.sip_username,
    }).eq("id", row.id).select().single();
    return done;
  } catch (err) {
    await admin.from("phone_numbers").update({ status: "failed", last_error: err instanceof Error ? err.message : String(err) }).eq("id", row.id);
    throw err instanceof TelnyxError ? new HttpError(502, `Could not set up your number: ${err.message}`) : err;
  }
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
