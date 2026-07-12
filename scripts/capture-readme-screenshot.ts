import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const url = process.env.SCREENSHOT_URL ?? "http://127.0.0.1:3000";
const outputDir = resolve(process.env.SCREENSHOT_OUTPUT_DIR ?? "docs/screenshots");
const apiKey = process.env.SCREENSHOT_API_KEY;

function output(name: string): string {
  return resolve(outputDir, name);
}

async function main() {
  mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "BlakFile" }).waitFor();
    await page.screenshot({ path: output("landing-page.png"), fullPage: true });

    if (!apiKey) return;

    await page.setExtraHTTPHeaders({ Authorization: `Bearer ${apiKey}` });
    const drivesResponse = await page.goto(new URL("/api/v1/drives", url).toString(), {
      waitUntil: "networkidle",
    });
    if (!drivesResponse?.ok()) throw new Error(`Could not capture authenticated drives: ${drivesResponse?.status()}`);
    const drives = (await drivesResponse.json()) as { drives: Array<{ id: string; type: string }> };
    const sharedDrive = drives.drives.find((drive) => drive.type === "shared");
    if (!sharedDrive) throw new Error("Seeded shared drive was not returned");
    await page.screenshot({ path: output("authenticated-drives.png"), fullPage: true });

    const contentsResponse = await page.goto(
      new URL(`/api/v1/drives/${sharedDrive.id}/children`, url).toString(),
      { waitUntil: "networkidle" },
    );
    if (!contentsResponse?.ok()) {
      throw new Error(`Could not capture authenticated drive contents: ${contentsResponse?.status()}`);
    }
    await page.screenshot({ path: output("authenticated-shared-drive.png"), fullPage: true });
  } finally {
    await browser.close();
  }
}

void main();
