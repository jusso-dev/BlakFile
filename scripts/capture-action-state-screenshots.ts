import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";

const baseUrl = process.env.SCREENSHOT_URL ?? "http://app:3000";
const outputDir = resolve(process.env.SCREENSHOT_OUTPUT_DIR ?? "/tmp/blakfile-action-screenshots");
const email = process.env.SCREENSHOT_EMAIL ?? "owner@northwind.example";
const password = process.env.SCREENSHOT_PASSWORD ?? "BlakFileDemo2026!";
const fileName = process.env.SCREENSHOT_FILE_NAME ?? "Authenticated Share Verification.txt";
const guestEmail = process.env.SCREENSHOT_GUEST_EMAIL ?? "reviewer@external.example";
const guestPassword = process.env.SCREENSHOT_GUEST_PASSWORD ?? "BlakFileGuest2026!";

function output(name: string): string { return resolve(outputDir, name); }

async function main() {
  mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/sign-in`, { waitUntil: "networkidle" });
    await page.screenshot({ path: output("sign-in.png"), fullPage: true });
    await page.goto(`${baseUrl}/register`, { waitUntil: "networkidle" });
    await page.screenshot({ path: output("organisation-onboarding.png"), fullPage: true });

    await page.goto(`${baseUrl}/sign-in`, { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/workspace");
    await page.getByText("Files and folders").waitFor();
    await page.screenshot({ path: output("workspace-authenticated.png"), fullPage: true });

    let file = page.getByRole("button", { name: `Manage sharing for ${fileName}` });
    if (!await file.count()) {
      const payload = Buffer.from("BlakFile documentation fixture");
      const driveResponse = await page.request.get(`${baseUrl}/api/v1/drives`);
      const driveId = ((await driveResponse.json()) as { drives: Array<{ id: string; type: string }> }).drives.find((drive) => drive.type === "shared")?.id;
      if (!driveId) throw new Error("No shared drive for screenshot fixture");
      const checksumSha256 = createHash("sha256").update(payload).digest("hex");
      const sessionResponse = await page.request.post(`${baseUrl}/api/v1/uploads`, { data: { driveId, name: fileName,
        sizeBytes: payload.length, mimeType: "text/plain", checksumSha256 } });
      if (!sessionResponse.ok()) throw new Error(`Screenshot upload session returned ${sessionResponse.status()}`);
      const session = await sessionResponse.json() as { uploadSessionId: string; objectKey: string; upload: { url: string; headers: Record<string, string> } };
      const put = await page.request.put(session.upload.url, { data: payload, headers: session.upload.headers });
      if (!put.ok()) throw new Error(`Screenshot storage PUT returned ${put.status()}`);
      const complete = await page.request.post(`${baseUrl}/api/v1/uploads/${session.uploadSessionId}/complete`,
        { data: { objectKey: session.objectKey, checksumSha256 } });
      if (!complete.ok()) throw new Error(`Screenshot upload completion returned ${complete.status()}`);
      await page.reload({ waitUntil: "networkidle" });
      await file.waitFor({ timeout: 20_000 });
    }
    const fileId = (await file.getAttribute("aria-label"))?.replace("Manage sharing for ", "") ?? "shared file";
    await file.click();
    await page.getByText("Create a named recipient grant").waitFor();
    await page.screenshot({ path: output("workspace-sharing.png"), fullPage: true });
    await page.getByLabel("Create access link").check();
    await page.getByLabel("Allow download").check();
    await page.getByRole("button", { name: "Create share" }).click();
    const shareInput = page.getByLabel("New share link");
    await shareInput.waitFor();
    const shareUrl = await shareInput.inputValue();
    const sharePath = new URL(shareUrl).pathname;
    // Never commit a live capability token in a documentation image.
    await page.screenshot({ path: output("workspace-share-link-created.png"), fullPage: true, mask: [shareInput], maskColor: "#fffdf8" });

    const detailLink = page.getByRole("link", { name: "Open file record →" });
    const detailPath = await detailLink.getAttribute("href");
    if (!detailPath) throw new Error(`No file detail route for ${fileId}`);
    await page.goto(`${baseUrl}${detailPath}`, { waitUntil: "networkidle" });
    await page.getByText("Version history").waitFor();
    await page.screenshot({ path: output("file-detail-version-history.png"), fullPage: true });

    const anonymous = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const anonymousPage = await anonymous.newPage();
    await anonymousPage.goto(`${baseUrl}${sharePath}`, { waitUntil: "networkidle" });
    await anonymousPage.getByText("Sign in to open this file").waitFor();
    await anonymousPage.screenshot({ path: output("share-link-authentication-gate.png"), fullPage: true });
    await anonymous.close();

    await page.goto(`${baseUrl}${sharePath}`, { waitUntil: "networkidle" });
    await page.getByText("Secure shared file").waitFor();
    await page.screenshot({ path: output("share-link-authenticated.png"), fullPage: true });
    const download = await page.request.get(`${baseUrl}/api/v1/share-links/${sharePath.slice(3)}/download`);
    if (!download.ok()) throw new Error(`Share-link download endpoint returned ${download.status()}`);

    // Named-recipient lifecycle: pending → accepted/active → revoked, then
    // re-invited/declined and expired. No invitation token is rendered in any
    // owner screenshot; guest captures show only resource metadata.
    const fileRouteId = detailPath.split("/").pop();
    if (!fileRouteId) throw new Error("No file id for recipient share");
    async function createRecipient(expiresAt?: string) {
      const response = await page.request.post(`${baseUrl}/api/v1/files/${fileRouteId}/shares`, { data: {
        recipientEmail: guestEmail, permissionLevel: "downloader", createLink: false, downloadEnabled: true,
        ...(expiresAt ? { expiresAt } : {}),
      } });
      if (!response.ok()) throw new Error(`Recipient share returned ${response.status()}`);
      return response.json() as Promise<{ id: string; recipientInviteUrl: string }>;
    }
    const recipient = await createRecipient();
    await page.goto(`${baseUrl}/workspace`, { waitUntil: "networkidle" });
    file = page.getByRole("button", { name: `Manage sharing for ${fileName}` }); await file.click();
    await page.getByText(guestEmail).waitFor();
    await page.screenshot({ path: output("workspace-recipient-pending.png"), fullPage: true });

    const guest = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    let signup = await guest.request.post(`${baseUrl}/api/auth/sign-up/email`, { data: { name: "External reviewer", email: guestEmail, password: guestPassword }, headers: { origin: baseUrl } });
    if (!signup.ok()) signup = await guest.request.post(`${baseUrl}/api/auth/sign-in/email`, { data: { email: guestEmail, password: guestPassword }, headers: { origin: baseUrl } });
    if (!signup.ok()) throw new Error(`Guest authentication returned ${signup.status()}`);
    const guestPage = await guest.newPage(); const recipientPath = new URL(recipient.recipientInviteUrl).pathname;
    await guestPage.goto(`${baseUrl}${recipientPath}`, { waitUntil: "networkidle" });
    await guestPage.getByRole("button", { name: "Accept access" }).waitFor();
    await guestPage.screenshot({ path: output("guest-invitation-pending.png"), fullPage: true });
    await guestPage.getByRole("button", { name: "Accept access" }).click();
    await guestPage.getByRole("button", { name: "Download file" }).waitFor();
    await guestPage.screenshot({ path: output("guest-file-active.png"), fullPage: true });

    await page.goto(`${baseUrl}/workspace`, { waitUntil: "networkidle" }); await file.click();
    await page.getByText(`${guestEmail}`).waitFor();
    await page.screenshot({ path: output("workspace-recipient-active.png"), fullPage: true });
    const revoke = await page.request.delete(`${baseUrl}/api/v1/shares/${recipient.id}`);
    if (!revoke.ok()) throw new Error(`Recipient revoke returned ${revoke.status()}`);
    await guestPage.reload({ waitUntil: "networkidle" });
    await guestPage.getByText("This invitation is no longer available.").waitFor();
    await guestPage.screenshot({ path: output("guest-access-revoked.png"), fullPage: true });

    const reinvite = await createRecipient();
    await guestPage.goto(`${baseUrl}${new URL(reinvite.recipientInviteUrl).pathname}`, { waitUntil: "networkidle" });
    await guestPage.getByRole("button", { name: "Decline" }).click();
    await guestPage.getByText("Invitation declined. No access was granted.").waitFor();
    await guestPage.screenshot({ path: output("guest-invitation-declined.png"), fullPage: true });
    await createRecipient(new Date(Date.now() - 60_000).toISOString());
    await page.goto(`${baseUrl}/workspace`, { waitUntil: "networkidle" }); file = page.getByRole("button", { name: `Manage sharing for ${fileName}` }); await file.click();
    await page.getByText(guestEmail).first().waitFor();
    await page.screenshot({ path: output("workspace-recipient-terminal-states.png"), fullPage: true });
    await guest.close();
    await context.close();
  } finally { await browser.close(); }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
