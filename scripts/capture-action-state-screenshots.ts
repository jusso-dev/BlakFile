import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.SCREENSHOT_URL ?? "http://app:3000";
const outputDir = resolve(process.env.SCREENSHOT_OUTPUT_DIR ?? "/tmp/blakfile-action-screenshots");
const email = process.env.SCREENSHOT_EMAIL ?? "owner@northwind.example";
const password = process.env.SCREENSHOT_PASSWORD ?? "BlakFileDemo2026!";
const fileName = process.env.SCREENSHOT_FILE_NAME ?? "Authenticated Share Verification.txt";

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

    const file = page.getByRole("button", { name: `Manage sharing for ${fileName}` });
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
    await context.close();
  } finally { await browser.close(); }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
