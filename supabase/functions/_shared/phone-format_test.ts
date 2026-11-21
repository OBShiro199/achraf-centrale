import { assertEquals } from "jsr:@std/assert@1.0.13";
import { toE164 } from "./phone-format.ts";

Deno.test("international formats keep their country code", () => {
  assertEquals(toE164("+44 20 7946 0958", null), "+442079460958");
  assertEquals(toE164("0049 30 123456", "Germany"), "+4930123456");
});

Deno.test("national formats are read for the US and UK", () => {
  assertEquals(toE164("(415) 555-0123", "United States"), "+14155550123");
  assertEquals(toE164("1-415-555-0123", ""), "+14155550123");
  assertEquals(toE164("020 7946 0958", "United Kingdom"), "+442079460958");
});

Deno.test("unknown countries and junk give null", () => {
  assertEquals(toE164("030 123456", "Germany"), null);
  assertEquals(toE164("n/a", "United States"), null);
});
