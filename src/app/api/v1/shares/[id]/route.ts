import { revokeShare } from "@/domains/sharing";
import { errorResponse } from "@/lib/http";
import { requireContext } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  let correlationId: string | undefined;
  try {
    const ctx = await requireContext(req);
    correlationId = ctx.request.correlationId;
    const { id } = await params;
    await revokeShare(ctx, id, await req.json().catch(() => ({})));
    return new Response(null, { status: 204, headers: { "x-correlation-id": correlationId } });
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
