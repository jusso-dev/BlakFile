import { expect, test } from "@playwright/test";

test("registration, sign-in, sign-out and workspace bootstrap", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await page.goto("/register");
  await page.getByLabel("Your name").fill("E2E Operator");
  await page.getByLabel("Work email").fill(`operator-${suffix}@e2e.example`);
  await page.getByLabel("Password").fill("BlakFileDemo2026!");
  await page.getByLabel("Organisation name").fill(`E2E ${suffix}`);
  await page.getByRole("button", { name: "Create secure workspace" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole("heading", { name: /Shared|Your files/ })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
});
