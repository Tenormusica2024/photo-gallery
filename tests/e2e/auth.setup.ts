import { expect, test } from "@playwright/test";

test("creates an authenticated session", async ({ page }) => {
  const email = `pastelalbum.e2e+${Date.now()}@gmail.com`;
  const password = "pastelalbum-test";

  await page.goto("/login");
  await page.getByRole("button", { name: "アカウント作成" }).click();
  await page.getByPlaceholder("example@email.com").fill(email);
  await page.getByPlaceholder("パスワードを入力").fill(password);
  await page.getByRole("button", { name: "アカウント作成" }).click();

  try {
    await page.waitForURL("**/", { timeout: 10000 });
  } catch {
    await expect(page.getByText("アカウントを作成しました。ログインしてください。")).toBeVisible();
    await page.getByRole("button", { name: "ログイン" }).last().click();
    await page.getByRole("button", { name: "ログイン" }).first().click();
    await page.waitForURL("**/");
  }

  await expect(page.getByRole("heading", { name: "大切な思い出" })).toBeVisible();

  await page.context().storageState({ path: "playwright/.auth/user.json" });
});
