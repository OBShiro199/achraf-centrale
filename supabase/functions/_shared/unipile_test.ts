import { assertEquals } from "jsr:@std/assert@1.0.13";
// unipile.ts reads its secrets through core.ts, which wants a Supabase URL even though these tests never call it.
Deno.env.set("SUPABASE_URL", Deno.env.get("SUPABASE_URL") ?? "http://localhost");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "test");
const { firstId, linkedinIdentifier, verifyUnipileSignature, whatsappId } = await import("./unipile.ts");

async function sign(key: string, t: number, body: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${body}`)));
  return [...s].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("a correctly signed webhook passes, a tampered or stale one does not", async () => {
  const t = Math.floor(Date.now() / 1000);
  const body = '{"type":"message.new"}';
  const v0 = await sign("secret", t, body);
  assertEquals(await verifyUnipileSignature(body, `t=${t},v0=${v0}`, "secret"), true);
  assertEquals(await verifyUnipileSignature(body + " ", `t=${t},v0=${v0}`, "secret"), false);
  assertEquals(await verifyUnipileSignature(body, `t=${t - 600},v0=${await sign("secret", t - 600, body)}`, "secret"), false);
  assertEquals(await verifyUnipileSignature(body, null, "secret"), false);
});

Deno.test("ids and handles", () => {
  assertEquals(firstId(["m1", "m2"]), "m1");
  assertEquals(firstId(null), null);
  assertEquals(linkedinIdentifier("https://www.linkedin.com/in/jane-doe-123/"), "jane-doe-123");
  assertEquals(whatsappId("+44 7700 900000"), "447700900000@s.whatsapp.net");
});
