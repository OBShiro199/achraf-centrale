import { defineConfig, devices } from "@playwright/test";

// End-to-end tests. Public pages run anywhere. The founder flow needs E2E_EMAIL and E2E_PASSWORD for one
// fixed tester account (oliverburt3+e2e@gmail.com style) that has finished onboarding; see e2e/README.md.
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx next dev --port 3100", url: "http://localhost:3100", reuseExistingServer: true, timeout: 120_000 },
});
