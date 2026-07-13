import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const url = process.env.SCREENSHOT_URL ?? "http://127.0.0.1:3000";
const outputDir = resolve(process.env.SCREENSHOT_OUTPUT_DIR ?? "docs/screenshots");

function output(name: string): string {
  return resolve(outputDir, name);
}

async function main() {
  mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: "light",
    });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "BlakFile" }).waitFor();
    await page.screenshot({ path: output("landing-page.png"), fullPage: true });

    const mobilePage = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      colorScheme: "light",
    });
    await mobilePage.goto(url, { waitUntil: "networkidle" });
    await mobilePage.getByRole("heading", { name: "BlakFile" }).waitFor();
    await mobilePage.screenshot({ path: output("landing-page-mobile.png"), fullPage: true });
  } finally {
    await browser.close();
  }
}

void main();
