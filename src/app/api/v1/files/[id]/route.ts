import { getFileDetail } from "@/domains/files";
import { errorResponse, json } from "@/lib/http";
import { requireContext } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  let correlationId: string | undefined;
  try {
    const ctx = await requireContext(req); correlationId = ctx.request.correlationId;
    const { id } = await params;
    return json(await getFileDetail(ctx, id), { headers: { "x-correlation-id": correlationId } });
  } catch (error) { return errorResponse(error, correlationId); }
}
