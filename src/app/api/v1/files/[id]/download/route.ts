/**
 * GET /api/v1/files/:id/download — authorise, then mint a short-lived signed URL.
 * The bytes are NEVER proxied through the app and the storage URL is never
 * permanent. Authorisation, legal-hold, classification obligations, and audit
 * all happen server-side before the URL exists.
 */
import { requireContext } from "@/lib/request-context";
import { errorResponse, json } from "@/lib/http";
import { getDownloadUrl } from "@/domains/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let correlationId: string | undefined;
  try {
    const ctx = await requireContext(req);
    correlationId = ctx.request.correlationId;
    const { id } = await params;
    const result = await getDownloadUrl(ctx, id);
    return json(result, {
      status: 200,
      headers: { "x-correlation-id": correlationId, "cache-control": "no-store" },
    });
  } catch (err) {
    return errorResponse(err, correlationId);
  }
}
