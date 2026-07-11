/**
 * Local storage transport for the development LocalDriver. Serves PUT (upload)
 * and GET (download) for HMAC-signed URLs the driver mints. Every request's
 * signature + expiry is verified; there is no ambient trust. Disabled unless
 * STORAGE_DRIVER=local. NOT for production — use S3/MinIO there.
 */
import { getStorage, LocalDriver } from "@/domains/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function localOr404(): LocalDriver | null {
  const s = getStorage();
  return s instanceof LocalDriver ? s : null;
}

function verify(driver: LocalDriver, url: URL, key: string, op: "put" | "get"): boolean {
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  if (!Number.isFinite(exp) || !sig) return false;
  return driver.verify(op, key, exp, sig);
}

export async function PUT(req: Request, { params }: { params: Promise<{ key: string }> }): Promise<Response> {
  const driver = localOr404();
  if (!driver) return new Response("Not found", { status: 404 });
  const { key } = await params;
  const objectKey = decodeURIComponent(key);
  const url = new URL(req.url);
  if (!verify(driver, url, objectKey, "put")) return new Response("Forbidden", { status: 403 });
  const buf = Buffer.from(await req.arrayBuffer());
  await driver.writeBytes(objectKey, buf);
  return new Response(null, { status: 200, headers: { etag: `"${buf.length}"` } });
}

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }): Promise<Response> {
  const driver = localOr404();
  if (!driver) return new Response("Not found", { status: 404 });
  const { key } = await params;
  const objectKey = decodeURIComponent(key);
  const url = new URL(req.url);
  if (!verify(driver, url, objectKey, "get")) return new Response("Forbidden", { status: 403 });

  const head = await driver.headObject(objectKey);
  if (!head) return new Response("Not found", { status: 404 });
  const stream = await driver.getObjectStream(objectKey);
  const filename = url.searchParams.get("filename");
  const disposition = url.searchParams.get("disposition") ?? "attachment";
  const cd = filename
    ? `${disposition}; filename="${filename.replace(/[\r\n"\\]/g, "_")}"`
    : disposition;
  return new Response(stream, {
    status: 200,
    headers: {
      "content-length": String(head.sizeBytes),
      "content-disposition": cd,
      "cache-control": "no-store",
      // Local dev objects may be anything; force download to avoid rendering.
      "x-content-type-options": "nosniff",
    },
  });
}
