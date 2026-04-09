import { expect, test } from "@playwright/test";

test("redirects anonymous users from upload to login", async ({ page }) => {
  await page.goto("/upload");

  await page.waitForURL(/\/login\?redirect=\/upload$/);
  await expect(page.getByRole("heading", { name: "おかえりなさい" })).toBeVisible();
});
