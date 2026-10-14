import type { Page } from "@playwright/test";

/**
 * Answers the edge functions that spend money (Claude, Firecrawl, new OpenMail inboxes) inside the browser,
 * so a test run costs nothing. Everything else (auth, search, the Outbox) hits the real backend.
 */
export async function fakePaidFunctions(page: Page) {
  const reply = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route(/\/functions\/v1\/draft-email/, (route) =>
    route.fulfill(reply({ subject: "E2E test draft", body: "Hi,\n\nThis is a test draft written by the end-to-end suite.\n\nThanks,\nE2E" })),
  );
  await page.route(/\/functions\/v1\/ai-search/, (route) =>
    route.fulfill(reply({ id: null, title: "Seed fintech investors", summary: "Test", notes: [], filters: { focus: ["Fintech"], stages: ["Seed"] }, prompt: "seed fintech" })),
  );
  await page.route(/\/functions\/v1\/match-investors/, (route) => route.fulfill(reply({ ok: true, count: 0 })));
  for (const fn of ["generate-deck", "build-profile", "scrape-site", "provision-inbox"]) {
    await page.route(new RegExp(`/functions/v1/${fn}`), (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Disabled in end-to-end tests"}' }));
  }
}
