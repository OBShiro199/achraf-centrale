import { expect, test } from "@playwright/test";

test("landing page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Centrale/i);
});

test("dashboard sends signed-out visitors to log in", async ({ page }) => {
  await page.goto("/dashboard/investors");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Finvestors/);
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
});

test("removal page asks for an email", async ({ page }) => {
  await page.goto("/remove");
  await expect(page.getByRole("heading", { name: "Remove yourself from Centrale" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send confirmation link" })).toBeDisabled();
});

test("unsubscribe without a code explains what to do", async ({ page }) => {
  await page.goto("/unsubscribe");
  await expect(page.getByText("This link is missing its code")).toBeVisible();
  await expect(page.getByRole("button", { name: "Unsubscribe me" })).toBeDisabled();
});

test("docs need a login", async ({ page }) => {
  await page.goto("/dashboard/docs");
  await expect(page).toHaveURL(/\/login/);
});
