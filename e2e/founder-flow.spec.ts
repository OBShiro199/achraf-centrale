import { expect, test } from "@playwright/test";
import { fakePaidFunctions } from "./fake-ai";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe("founder flow", () => {
  test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD for the tester account");

  test.beforeEach(async ({ page }) => {
    await fakePaidFunctions(page);
    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("search, draft the top 10, queue, then cancel so nothing sends", async ({ page }) => {
    await page.goto("/dashboard/investors");
    await expect(page.getByRole("button", { name: /Email the top/ })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /Email the top/ }).click();
    await page.getByRole("button", { name: "Top 10 investors" }).click();
    const queue = page.getByRole("button", { name: /^Queue \d+ emails?$/ });
    await expect(queue).toBeEnabled({ timeout: 60_000 });
    const queued = Number((await queue.textContent())?.match(/\d+/)?.[0] ?? 0);
    expect(queued).toBeGreaterThan(0);
    await queue.click();

    await page.goto("/dashboard/outbox");
    await expect(page.getByText("E2E test draft").first()).toBeVisible({ timeout: 30_000 });

    // Cancel everything this test queued.
    for (let i = 0; i < queued; i++) {
      const row = page.getByRole("button", { name: "Cancel" }).first();
      if (!(await row.isVisible().catch(() => false))) break;
      await row.click();
      await page.getByRole("button", { name: /^Cancel email$/ }).click();
    }
    await expect(page.getByText("E2E test draft")).toHaveCount(0, { timeout: 30_000 });
  });

  test("pipeline, settings and docs load", async ({ page }) => {
    await page.goto("/dashboard/pipeline");
    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
    await page.goto("/dashboard/settings");
    await expect(page.getByText("Booking link")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete account" })).toBeVisible();
    await page.goto("/dashboard/docs");
    await expect(page.getByRole("heading", { name: "Pipeline" }).first()).toBeVisible();
  });
});
