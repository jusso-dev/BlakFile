/**
 * POST /api/v1/uploads — create a secure upload session.
 * Returns a short-lived signed upload URL bound to an opaque object key. The
 * caller PUTs the bytes directly to storage, then calls the complete endpoint.
 */
import { requireContext } from "@/lib/request-context";
import { errorResponse, json } from "@/lib/http";
import { createUploadSession } from "@/domains/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let correlationId: string | undefined;
  try {
    const ctx = await requireContext(req);
    correlationId = ctx.request.correlationId;
    const body = await req.json();
    const result = await createUploadSession(ctx, body);
    return json(result, { status: 201, headers: { "x-correlation-id": correlationId } });
  } catch (err) {
    return errorResponse(err, correlationId);
  }
}
