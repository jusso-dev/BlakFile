import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const roots = process.argv.slice(2);
const secretPatterns = [
  [/bf_live_[A-Za-z0-9_-]+/g, "[redacted]"],
  [/(\/s\/|\/g\/)[A-Za-z0-9_-]{24,}/g, "$1[redacted]"],
  [/("?(?:token|password|authorization)"?\s*[:=]\s*"?)[^"\s,}]+/gi, "$1[redacted]"],
];
async function visit(path) {
  const info = await stat(path).catch(() => null); if (!info) return;
  if (info.isDirectory()) { for (const name of await readdir(path)) await visit(join(path, name)); return; }
  if (!/\.(txt|log|json|html|xml|md)$/i.test(path)) return;
  let body = await readFile(path, "utf8");
  for (const [pattern, replacement] of secretPatterns) body = body.replace(pattern, replacement);
  await writeFile(path, body);
}
for (const root of roots) await visit(root);
