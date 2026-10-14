import { assertEquals } from "jsr:@std/assert@1.0.13";
import { isDisposable } from "./disposable.ts";

Deno.test("throwaway domains and their subdomains are refused", () => {
  assertEquals(isDisposable("a@mailinator.com"), true);
  assertEquals(isDisposable("a@sub.yopmail.com"), true);
  assertEquals(isDisposable("A@GuerrillaMail.com"), true);
});

Deno.test("ordinary addresses pass", () => {
  assertEquals(isDisposable("founder@gmail.com"), false);
  assertEquals(isDisposable("ceo@acme.co.uk"), false);
  assertEquals(isDisposable("x@notmailinator.com"), false);
});
