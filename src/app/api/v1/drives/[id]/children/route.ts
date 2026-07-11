/**
 * GET /api/v1/drives/:id/children?folderId= — list folders + files at a location.
 * Omit folderId for the drive root.
 */
import { requireContext } from "@/lib/request-context";
import { errorResponse, json } from "@/lib/http";
import { listFolderContents } from "@/domains/workspaces";

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
    const folderId = new URL(req.url).searchParams.get("folderId");
    const contents = await listFolderContents(ctx, { driveId: id, folderId });
    return json(contents, { headers: { "x-correlation-id": correlationId } });
  } catch (err) {
    return errorResponse(err, correlationId);
  }
}
