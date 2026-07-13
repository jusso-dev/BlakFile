import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const url = process.env.SCREENSHOT_URL ?? "http://127.0.0.1:3000";
const outputDir = resolve(process.env.SCREENSHOT_OUTPUT_DIR ?? "docs/screenshots");

type Screenshot = {
  name: string;
  viewport: { width: number; height: number };
  isMobile?: boolean;
};

const screenshots: Screenshot[] = [
  {
    name: "workspace-overview-desktop.png",
    viewport: { width: 1440, height: 900 },
  },
  {
    name: "workspace-overview-tablet-landscape.png",
    viewport: { width: 1024, height: 768 },
  },
  {
    name: "workspace-overview-tablet-portrait.png",
    viewport: { width: 768, height: 1024 },
  },
  {
    name: "workspace-overview-mobile.png",
    viewport: { width: 390, height: 844 },
    isMobile: true,
  },
  {
    name: "workspace-overview-mobile-compact.png",
    viewport: { width: 320, height: 568 },
    isMobile: true,
  },
  {
    name: "workspace-overview-mobile-landscape.png",
    viewport: { width: 844, height: 390 },
    isMobile: true,
  },
];

function output(name: string): string {
  return resolve(outputDir, name);
}

async function main() {
  mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const screenshot of screenshots) {
      const page = await browser.newPage({
        viewport: screenshot.viewport,
        deviceScaleFactor: 1,
        ...(screenshot.isMobile ? { isMobile: true } : {}),
      });
      await page.goto(url, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Shared workspace" }).waitFor();
      await page.screenshot({ path: output(screenshot.name), fullPage: true });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

void main();
