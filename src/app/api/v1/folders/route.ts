/** POST /api/v1/folders — create a folder in a drive. */
import { requireContext } from "@/lib/request-context";
import { errorResponse, json } from "@/lib/http";
import { createFolder } from "@/domains/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let correlationId: string | undefined;
  try {
    const ctx = await requireContext(req);
    correlationId = ctx.request.correlationId;
    const folder = await createFolder(ctx, await req.json());
    return json(folder, { status: 201, headers: { "x-correlation-id": correlationId } });
  } catch (err) {
    return errorResponse(err, correlationId);
  }
}
