// Click counter for the booking link in sent emails. GET ?m=<outreach message id> records the click and
// redirects to the founder's current booking link, so a link changed later still works in old emails.
import { admin } from "../_shared/core.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const id = new URL(req.url).searchParams.get("m");
  let target: string | null = null;
  if (id && UUID.test(id)) {
    const { data, error } = await admin.rpc("record_calendar_click", { p_message_id: id });
    if (error) console.error(error);
    target = typeof data === "string" && data.startsWith("https://") ? data : null;
  }
  if (!target) return new Response("This booking link is no longer available. Reply to the email to find a time.", { status: 404 });
  return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store" } });
});
