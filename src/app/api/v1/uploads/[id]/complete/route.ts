/**
 * POST /api/v1/uploads/:id/complete — finalise an upload.
 * Validates the stored object (size + checksum), creates the file + first
 * version in a quarantined state, and enqueues the security pipeline. The file
 * is NOT downloadable until malware scanning clears it.
 */
import { requireContext } from "@/lib/request-context";
import { errorResponse, json } from "@/lib/http";
import { completeUpload } from "@/domains/files";
import { Errors } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let correlationId: string | undefined;
  try {
    const ctx = await requireContext(req);
    correlationId = ctx.request.correlationId;
    const { id } = await params;
    const body = (await req.json()) as { objectKey?: string; checksumSha256?: string; parts?: unknown };
    if (typeof body.objectKey !== "string") throw Errors.validation("objectKey is required");
    const result = await completeUpload(ctx, { ...body, uploadSessionId: id }, body.objectKey);
    return json(result, { status: 200, headers: { "x-correlation-id": correlationId } });
  } catch (err) {
    return errorResponse(err, correlationId);
  }
}
