// 1x1 open-tracking pixel for outbound investor emails.
import { admin } from "../_shared/core.ts";

const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="), (c) => c.charCodeAt(0));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const id = new URL(req.url).searchParams.get("m");
  if (id && UUID.test(id)) {
    const { error } = await admin.rpc("record_open", { p_message_id: id });
    if (error) console.error(error);
  }
  return new Response(GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
});
