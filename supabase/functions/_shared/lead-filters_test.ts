import { assertEquals } from "jsr:@std/assert@1.0.13";
import { FILTER_SPECS, fromEntries, sanitize, type Facets } from "./lead-filters.ts";

const facets: Facets = {
  stage: [{ value: "Seed", n: 10 }, { value: "Buyout/PE", n: 5 }],
  focus: [{ value: "FinTech", n: 10 }, { value: "AI/ML", n: 8 }],
  country: [{ value: "United Kingdom", n: 4 }],
  role: [{ value: "partner", n: 9 }],
  industry: [{ value: "Venture Capital and Private Equity Principals", n: 9 }],
};

Deno.test("enum values match their real spelling and invented ones are dropped", () => {
  const f = sanitize({ focus: ["fintech", "Quantum Bananas"], countries: ["united kingdom"], stages: ["seed", "Series Z"] }, facets);
  assertEquals(f, { focus: ["FinTech"], countries: ["United Kingdom"], stages: ["Seed"] });
});

Deno.test("unknown fields and wrong types are removed", () => {
  const f = sanitize({ hacker: ["x"], hasEmail: "yes", titles: "partner", minScore: "60", focus: ["FinTech"] } as never, facets);
  assertEquals(f, { focus: ["FinTech"] });
});

Deno.test("numbers are clamped and a back-to-front range is swapped", () => {
  assertEquals(sanitize({ minScore: 400 }, facets), { minScore: 100 });
  assertEquals(sanitize({ foundedMin: 2020, foundedMax: 2010 }, facets), { foundedMin: 2010, foundedMax: 2020 });
});

Deno.test("lists are capped and deduplicated", () => {
  const f = sanitize({ titles: Array.from({ length: 40 }, (_, i) => `t${i % 25}`) }, facets);
  assertEquals((f.titles as string[]).length, 20);
});

Deno.test("field and values pairs become a typed filter object", () => {
  const raw = fromEntries([
    { field: "titles", values: ["partner"] },
    { field: "titles", values: ["managing director"] },
    { field: "hasEmail", values: ["yes"] },
    { field: "saved", values: ["no"] },
    { field: "foundedMin", values: ["2,015"] },
    { field: "__proto__", values: ["x"] },
    { field: "nonsense", values: ["x"] },
  ]);
  assertEquals(sanitize(raw, facets), { titles: ["partner", "managing director"], hasEmail: true, saved: false, foundedMin: 2015 });
});

Deno.test("fixed-value filters accept only their values", () => {
  assertEquals(sanitize({ status: ["Replied", "ghosted"] }, facets), { status: ["replied"] });
});

Deno.test("every spec has a kind and an explanation", () => {
  for (const s of FILTER_SPECS) {
    assertEquals(typeof s.about, "string");
    if (s.kind === "multi") assertEquals(Boolean(s.facet || s.values), true);
  }
});
