import { expect, request, test } from "@playwright/test";
import { createHash } from "node:crypto";

const password = "BlakFileDemo2026!";
test.use({ trace: "off" });

test.describe("token-sensitive sharing flow", () => {
  test("upload, immutable version, preview, auth gate, download, revoke and tenant isolation", async ({ page, baseURL }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("owner@northwind.example");
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/workspace$/);

    const drives = await page.request.get("/api/v1/drives"); expect(drives.ok()).toBeTruthy();
    const driveId = (await drives.json()).drives.find((drive: { type: string }) => drive.type === "shared").id;
    const content = Buffer.from("BlakFile e2e governed preview content.");
    const checksumSha256 = createHash("sha256").update(content).digest("hex");
    const initiated = await page.request.post("/api/v1/uploads", { data: { driveId, name: "e2e-security.txt",
      sizeBytes: content.length, mimeType: "text/plain", checksumSha256 } });
    expect(initiated.status()).toBe(201);
    const upload = await initiated.json();
    const stored = await page.request.put(upload.upload.url, { headers: upload.upload.headers, data: content }); expect(stored.ok()).toBeTruthy();
    const completed = await page.request.post(`/api/v1/uploads/${upload.uploadSessionId}/complete`, {
      data: { objectKey: upload.objectKey, checksumSha256 },
    }); expect(completed.status()).toBe(200);
    const file = await completed.json();

    await expect.poll(async () => (await (await page.request.get(`/api/v1/files/${file.fileId}`)).json()).status,
      { timeout: 30_000 }).toBe("available");
    await page.goto(`/files/${file.fileId}`);
    await expect(page.getByRole("heading", { name: "e2e-security.txt" })).toBeVisible();
    await page.getByRole("button", { name: "Open preview" }).click();
    await expect(page.getByText("BlakFile e2e governed preview content.")).toBeVisible();
    await expect(page.getByText("Version 1")).toBeVisible();

    const versionContent = Buffer.from("BlakFile e2e governed preview content, version two.");
    const versionChecksum = createHash("sha256").update(versionContent).digest("hex");
    const versionInitiated = await page.request.post("/api/v1/uploads", { data: { driveId, fileId: file.fileId,
      name: "e2e-security.txt", sizeBytes: versionContent.length, mimeType: "text/plain", checksumSha256: versionChecksum } });
    expect(versionInitiated.status()).toBe(201); const versionUpload = await versionInitiated.json();
    expect((await page.request.put(versionUpload.upload.url, { headers: versionUpload.upload.headers, data: versionContent })).ok()).toBeTruthy();
    expect((await page.request.post(`/api/v1/uploads/${versionUpload.uploadSessionId}/complete`, {
      data: { objectKey: versionUpload.objectKey, checksumSha256: versionChecksum },
    })).ok()).toBeTruthy();
    await expect.poll(async () => (await (await page.request.get(`/api/v1/files/${file.fileId}`)).json()).status,
      { timeout: 30_000 }).toBe("available");
    await page.reload(); await expect(page.getByText("Version 2")).toBeVisible();

    const createdShare = await page.request.post(`/api/v1/files/${file.fileId}/shares`, { data: {
      permissionLevel: "downloader", createLink: true, downloadEnabled: true, requireAuth: true,
      maxAccessCount: 3, allowedCountries: [], allowedDomains: [], allowedIpRanges: [], oneTime: false,
    } }); expect(createdShare.status()).toBe(201);
    const share = await createdShare.json();
    const tokenPath = new URL(share.link.url).pathname;
    const recipientShare = await page.request.post(`/api/v1/files/${file.fileId}/shares`, { data: {
      permissionLevel: "viewer", recipientEmail: "member@northwind.example", createLink: false,
    } }); expect(recipientShare.status()).toBe(201);
    const invitationPath = new URL((await recipientShare.json()).recipientInviteUrl).pathname;

    const southern = await request.newContext({ baseURL: baseURL!, extraHTTPHeaders: { authorization: "Bearer bf_live_screenshot_southerncross_2026" } });
    const crossTenant = await southern.get(`/api/v1/files/${file.fileId}`); expect([403, 404]).toContain(crossTenant.status());
    await southern.dispose();
    const tampered = await page.request.get(`/api/v1/share-links/${"x".repeat(43)}`); expect(tampered.status()).toBe(404);

    await page.getByRole("link", { name: "Back to workspace" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.context().clearCookies();
    await page.goto(tokenPath);
    await expect(page.getByRole("heading", { name: "Sign in to open this file" })).toBeVisible();
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("owner@southerncross.example"); await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click(); await expect(page).toHaveURL(/\/workspace$/);
    await page.goto(invitationPath); await expect(page.getByText("This invitation was sent to a different account.")).toBeVisible();
    await page.context().clearCookies();
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("owner@northwind.example"); await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/workspace$/);
    await page.goto(tokenPath);
    await expect(page.getByRole("heading", { name: "e2e-security.txt" })).toBeVisible();
    const download = await page.request.get(`/api/v1/share-links/${tokenPath.split("/").pop()}/download`); expect(download.ok()).toBeTruthy();
    const revoked = await page.request.delete(`/api/v1/shares/${share.id}`, { data: { reason: "E2E security regression" } }); expect(revoked.status()).toBe(204);
    await page.goto(tokenPath);
    await expect(page.getByRole("heading", { name: "This link is unavailable" })).toBeVisible();
  });
});
