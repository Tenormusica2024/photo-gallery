import { expect, test } from "@playwright/test";

const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5z8AAAAASUVORK5CYII=";
const fakeVideoBase64 = "AAAAHGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQAAAAhmcmVl";

async function attachUploadFile(page: Parameters<typeof test>[0]["page"]) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "e2e-upload.png",
    mimeType: "image/png",
    buffer: Buffer.from(pngBase64, "base64"),
  });
}

async function attachVideoFile(page: Parameters<typeof test>[0]["page"]) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "e2e-video.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from(fakeVideoBase64, "base64"),
  });
}

async function signUpAndLand(page: Parameters<typeof test>[0]["page"], email: string, password: string) {
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
}

test.describe("authenticated flows", () => {
  test("uploads an image and shows it in the gallery", async ({ page }) => {
    const title = `E2E Upload ${Date.now()}`;

    await page.goto("/upload");
    await attachUploadFile(page);

    await page.getByPlaceholder("写真・動画のタイトル").fill(title);
    await page.getByRole("button", { name: /写真 1枚をアップロード/ }).click();

    await page.waitForURL("**/");
    await expect(page.getByAltText(title)).toBeVisible();
  });

  test("uploads a video and shows it in the video gallery", async ({ page }) => {
    const title = `E2E Video ${Date.now()}`;
    const secureUrl = `https://example.com/${title.replace(/\s+/g, "-")}.mp4`;

    await page.route("**/v1_1/**/video/upload", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          public_id: `pastelalbum/${title.replace(/\s+/g, "-").toLowerCase()}`,
          secure_url: secureUrl,
          width: 1920,
          height: 1080,
        }),
      });
    });

    await page.goto("/upload");
    await attachVideoFile(page);
    await page.getByPlaceholder("写真・動画のタイトル").fill(title);
    await page.getByRole("button", { name: /動画 1本をアップロード/ }).click();

    await page.waitForURL("**/");
    await page.getByRole("button", { name: "動画" }).click();
    await expect(page.locator(`video[src="${secureUrl}"]`).first()).toBeVisible();
  });

  test("shows the signature API error when upload authorization fails", async ({ page }) => {
    await page.route("**/api/cloudinary-signature", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "認証が必要です" }),
      });
    });

    await page.goto("/upload");
    await attachUploadFile(page);
    await page.getByRole("button", { name: /写真 1枚をアップロード/ }).click();

    await expect(page.locator("p.text-red-400", { hasText: "認証が必要です" })).toBeVisible();
    await expect(page).toHaveURL(/\/upload$/);
  });

  test("shows the Cloudinary error when asset upload fails", async ({ page }) => {
    await page.route("**/v1_1/**/image/upload", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Cloudinary upload broken" } }),
      });
    });

    await page.goto("/upload");
    await attachUploadFile(page);
    await page.getByRole("button", { name: /写真 1枚をアップロード/ }).click();

    await expect(page.locator("p.text-red-400", { hasText: "Cloudinary upload broken" })).toBeVisible();
    await expect(page).toHaveURL(/\/upload$/);
  });

  test("shows the database error when photo persistence fails", async ({ page }) => {
    let cleanupPayload: { publicId?: string; resourceType?: string } | null = null;

    await page.route("**/rest/v1/photos*", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          code: "23503",
          details: null,
          hint: null,
          message: "photos insert failed",
        }),
      });
    });
    await page.route("**/api/cloudinary-delete", async (route) => {
      cleanupPayload = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: "ok" }),
      });
    });

    await page.goto("/upload");
    await attachUploadFile(page);
    await page.getByRole("button", { name: /写真 1枚をアップロード/ }).click();

    await expect(page.locator("p.text-red-400", { hasText: "photos insert failed" })).toBeVisible();
    expect(cleanupPayload).toMatchObject({
      publicId: expect.stringMatching(/^pastelalbum\//),
      resourceType: "image",
    });
    await expect(page).toHaveURL(/\/upload$/);
  });

  test("creates a family and lets another user join by invite", async ({ page, browser }) => {
    const familyName = `E2E Family ${Date.now()}`;

    await page.goto("/admin");
    await page.getByRole("button", { name: "ファミリー" }).click();
    await page.getByPlaceholder("ファミリー名（例：田中ファミリー）").fill(familyName);
    await page.getByRole("button", { name: "ファミリーグループを作成" }).click();

    await expect(page.getByRole("heading", { name: familyName })).toBeVisible();
    const inviteCode = (await page.locator("code").textContent())?.trim();
    expect(inviteCode).toBeTruthy();

    const inviteContext = await browser.newContext();
    const invitePage = await inviteContext.newPage();
    const inviteeEmail = `pastelalbum.invitee+${Date.now()}@gmail.com`;
    const password = "pastelalbum-test";

    await invitePage.goto("/login");
    await invitePage.getByRole("button", { name: "アカウント作成" }).click();
    await invitePage.getByPlaceholder("example@email.com").fill(inviteeEmail);
    await invitePage.getByPlaceholder("パスワードを入力").fill(password);
    await invitePage.getByRole("button", { name: "アカウント作成" }).click();

    try {
      await invitePage.waitForURL("**/", { timeout: 10000 });
    } catch {
      await expect(invitePage.getByText("アカウントを作成しました。ログインしてください。")).toBeVisible();
      await invitePage.getByRole("button", { name: "ログイン" }).last().click();
      await invitePage.getByRole("button", { name: "ログイン" }).first().click();
      await invitePage.waitForURL("**/");
    }

    await invitePage.goto(`/invite?code=${inviteCode}`);
    await expect(invitePage.getByRole("heading", { name: `${familyName}に参加しますか?` })).toBeVisible();
    await invitePage.getByRole("button", { name: "ファミリーに参加" }).click();
    await expect(invitePage.getByRole("heading", { name: "ようこそ!" })).toBeVisible();

    await inviteContext.close();
  });

  test("copies the invite link and removes a member from admin", async ({ browser }) => {
    const ownerContext = await browser.newContext();
    await ownerContext.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: "http://localhost:3000",
    });
    const ownerPage = await ownerContext.newPage();
    const ownerEmail = `pastelalbum.admin+${Date.now()}@gmail.com`;
    const ownerPassword = "pastelalbum-test";
    const familyName = `Admin Flow ${Date.now()}`;

    await signUpAndLand(ownerPage, ownerEmail, ownerPassword);
    await ownerPage.goto("/admin");
    await ownerPage.getByRole("button", { name: "ファミリー" }).click();
    await ownerPage.getByPlaceholder("ファミリー名（例：田中ファミリー）").fill(familyName);
    await ownerPage.getByRole("button", { name: "ファミリーグループを作成" }).click();

    await expect(ownerPage.getByRole("heading", { name: familyName })).toBeVisible();
    const inviteCode = (await ownerPage.locator("code").textContent())?.trim();
    expect(inviteCode).toBeTruthy();

    await ownerPage.getByRole("button", { name: "リンクをコピー" }).click();
    await expect(ownerPage.getByRole("button", { name: "コピー済み" })).toBeVisible();
    await expect.poll(async () => ownerPage.evaluate(() => navigator.clipboard.readText())).toContain(
      `/invite?code=${inviteCode}`,
    );

    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    const inviteeEmail = `pastelalbum.member+${Date.now()}@gmail.com`;

    await signUpAndLand(inviteePage, inviteeEmail, ownerPassword);
    await inviteePage.goto(`/invite?code=${inviteCode}`);
    await inviteePage.getByRole("button", { name: "ファミリーに参加" }).click();
    await expect(inviteePage.getByRole("heading", { name: "ようこそ!" })).toBeVisible();
    await inviteeContext.close();

    await ownerPage.goto("/admin");
    await ownerPage.getByRole("button", { name: "ファミリー" }).click();
    await expect(ownerPage.getByText(inviteeEmail)).toBeVisible();
    const memberRow = ownerPage.locator("div.flex.items-center.justify-between.py-2").filter({
      hasText: inviteeEmail,
    });
    await memberRow.getByRole("button", { name: "削除" }).click();
    await expect(ownerPage.getByText(inviteeEmail)).toHaveCount(0);

    await ownerContext.close();
  });

  test("shows masked admin error logs after a failed member removal", async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const ownerEmail = `pastelalbum.adminlog+${Date.now()}@gmail.com`;
    const ownerPassword = "pastelalbum-test";
    const familyName = `Admin Error ${Date.now()}`;

    await signUpAndLand(ownerPage, ownerEmail, ownerPassword);
    await ownerPage.goto("/admin");
    await ownerPage.getByRole("button", { name: "ファミリー" }).click();
    await ownerPage.getByPlaceholder("ファミリー名（例：田中ファミリー）").fill(familyName);
    await ownerPage.getByRole("button", { name: "ファミリーグループを作成" }).click();

    await expect(ownerPage.getByRole("heading", { name: familyName })).toBeVisible();
    const inviteCode = (await ownerPage.locator("code").textContent())?.trim();
    expect(inviteCode).toBeTruthy();

    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    const inviteeEmail = `pastelalbum.errmember+${Date.now()}@gmail.com`;

    await signUpAndLand(inviteePage, inviteeEmail, ownerPassword);
    await inviteePage.goto(`/invite?code=${inviteCode}`);
    await inviteePage.getByRole("button", { name: "ファミリーに参加" }).click();
    await expect(inviteePage.getByRole("heading", { name: "ようこそ!" })).toBeVisible();
    await inviteeContext.close();

    await ownerPage.route("**/rest/v1/rpc/remove_family_member", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "error",
          code: "Bearer secret-token test@example.com key=abc eyJabcdefghijklmnop",
        }),
      });
    });

    await ownerPage.goto("/admin");
    await ownerPage.getByRole("button", { name: "ファミリー" }).click();
    const memberRow = ownerPage.locator("div.flex.items-center.justify-between.py-2").filter({
      hasText: inviteeEmail,
    });
    await memberRow.getByRole("button", { name: "削除" }).click();

    await expect(ownerPage.locator("p.text-red-400", { hasText: "メンバーを削除できませんでした。" })).toBeVisible();
    await ownerPage.getByRole("button", { name: /エラー \(1\)/ }).click();
    await expect(ownerPage.getByText("エラーログ（このセッション内）")).toBeVisible();
    await expect(ownerPage.getByText(/Bearer \[MASKED\]/)).toBeVisible();
    await expect(ownerPage.getByText(/\[EMAIL\]/)).toBeVisible();
    await expect(ownerPage.getByText(/key=\[MASKED\]/)).toBeVisible();
    await expect(ownerPage.getByText(/\[TOKEN\]/)).toBeVisible();

    await ownerContext.close();
  });

  test("renames the profile and creates an album", async ({ page }) => {
    const profileName = `e2e-user-${Date.now()}`;
    const albumName = `E2E Album ${Date.now()}`;

    await page.goto("/profile");

    await page.getByRole("button", { name: "名前を編集" }).click();
    await page.getByRole("textbox").fill(profileName);
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByRole("heading", { name: profileName })).toBeVisible();

    await page.getByRole("button", { name: "+ 新しいアルバム" }).click();
    await page.getByPlaceholder("アルバム名").fill(albumName);
    await page.getByRole("button", { name: "作成" }).click();
    await expect(page.getByRole("link", { name: new RegExp(albumName) })).toBeVisible();
  });

  test("loads the profile page for an authenticated user", async ({ page }) => {
    await page.goto("/profile");

    await expect(page.getByText("マイアルバム")).toBeVisible();
    await expect(page.getByRole("button", { name: "名前を編集" })).toBeVisible();
  });

  test("loads the upload page for an authenticated user", async ({ page }) => {
    await page.goto("/upload");

    await expect(page.getByRole("heading", { name: "アップロード" })).toBeVisible();
    await expect(page.getByText("クリックして写真や動画を選択")).toBeVisible();
  });
});
