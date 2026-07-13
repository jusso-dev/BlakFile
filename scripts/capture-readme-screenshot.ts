import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const url = process.env.SCREENSHOT_URL ?? "http://127.0.0.1:3000";
const outputDir = resolve(process.env.SCREENSHOT_OUTPUT_DIR ?? "docs/screenshots");

type Screenshot = {
  name: string;
  viewport: { width: number; height: number };
  colorScheme: "light" | "dark";
  isMobile?: boolean;
};

const screenshots: Screenshot[] = [
  {
    name: "landing-page-desktop-light.png",
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  },
  {
    name: "landing-page-desktop-dark.png",
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  },
  {
    name: "landing-page-tablet-landscape.png",
    viewport: { width: 1024, height: 768 },
    colorScheme: "light",
  },
  {
    name: "landing-page-tablet-portrait.png",
    viewport: { width: 768, height: 1024 },
    colorScheme: "light",
  },
  {
    name: "landing-page-mobile.png",
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    isMobile: true,
  },
  {
    name: "landing-page-mobile-dark.png",
    viewport: { width: 390, height: 844 },
    colorScheme: "dark",
    isMobile: true,
  },
  {
    name: "landing-page-mobile-compact.png",
    viewport: { width: 320, height: 568 },
    colorScheme: "light",
    isMobile: true,
  },
  {
    name: "landing-page-mobile-landscape.png",
    viewport: { width: 844, height: 390 },
    colorScheme: "light",
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
        colorScheme: screenshot.colorScheme,
        ...(screenshot.isMobile ? { isMobile: true } : {}),
      });
      await page.goto(url, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "BlakFile" }).waitFor();
      await page.screenshot({ path: output(screenshot.name), fullPage: true });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

void main();
