import { assertEquals } from "jsr:@std/assert@1.0.13";
import { allowedOrigin } from "./cors.ts";
import { functionName } from "./function-name.ts";

Deno.test("Centrale's own origins are allowed", () => {
  for (const o of ["https://www.centralegtm.com", "https://centralegtm.com", "https://achraf-centrale.vercel.app", "https://achraf-centrale-git-main-obshiro199s-projects.vercel.app", "http://localhost:3001", "http://127.0.0.1:3000"]) {
    assertEquals(allowedOrigin(o), o);
  }
});

Deno.test("other origins and look-alikes are refused", () => {
  for (const o of ["https://evil.com", "https://www.centralegtm.com.evil.com", "http://www.centralegtm.com", "https://someone-else.vercel.app", "https://achraf-centrale.vercel.app.evil.io", null]) {
    assertEquals(allowedOrigin(o), null);
  }
});

Deno.test("function names come from either path style", () => {
  assertEquals(functionName(new Request("http://localhost/whop-webhook")), "whop-webhook");
  assertEquals(functionName(new Request("https://x.supabase.co/functions/v1/openmail-webhook?x=1")), "openmail-webhook");
});
