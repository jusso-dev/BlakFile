/** GET /api/v1/drives — list the drives in the caller's organisation. */
import { requireContext } from "@/lib/request-context";
import { errorResponse, json } from "@/lib/http";
import { listDrives } from "@/domains/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  let correlationId: string | undefined;
  try {
    const ctx = await requireContext(req);
    correlationId = ctx.request.correlationId;
    const drives = await listDrives(ctx);
    return json({ drives }, { headers: { "x-correlation-id": correlationId } });
  } catch (err) {
    return errorResponse(err, correlationId);
  }
}
