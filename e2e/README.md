# End-to-end tests

Playwright tests for the app. Calls that cost money (Claude drafts, AI search, Claude picks, decks, website
scrapes, new OpenMail inboxes) are answered inside the browser by `fake-ai.ts`, so a run spends nothing.
Search, the Outbox and auth use the real backend.

## Run

```bash
npx playwright install chromium
npx playwright test e2e/public.spec.ts
```

The founder flow needs one fixed tester account that has finished onboarding, so runs never create new
OpenMail inboxes. Use a plus address on the tester list, for example `oliverburt3+e2e@gmail.com`, sign it up
once by hand, then:

```bash
E2E_EMAIL=oliverburt3+e2e@gmail.com E2E_PASSWORD=... npx playwright test
```

Against the live site instead of a local dev server, add `E2E_BASE_URL=https://www.centralegtm.com`.

The flow queues emails to the top 10 investors of the default search and cancels them straight away, so
nothing is sent. If a run dies between the two, cancel the "E2E test draft" emails in the Outbox by hand
(they would only ever reach the test inbox while `OUTREACH_LIVE` is off).

In GitHub, the `e2e` workflow runs the public tests on every pull request and the founder flow when the
`E2E_EMAIL` and `E2E_PASSWORD` repository secrets are set.
