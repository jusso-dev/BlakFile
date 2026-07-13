import { getShareLinkDownload } from "@/domains/sharing";
import { errorResponse, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  try {
    const { token } = await params;
    return json(await getShareLinkDownload(token, req.headers), { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
