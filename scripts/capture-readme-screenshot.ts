import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";

const url = process.env.SCREENSHOT_URL ?? "http://127.0.0.1:3000";
const output = resolve("docs/screenshots/landing-page.png");

async function main() {
  mkdirSync(dirname(output), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "BlakFile" }).waitFor();
    await page.screenshot({ path: output, fullPage: true });
  } finally {
    await browser.close();
  }
}

void main();
