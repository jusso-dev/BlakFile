import { declineGuestInvitation } from "@/domains/sharing";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  try { await declineGuestInvitation((await params).token, req.headers); return new Response(null, { status: 204 }); }
  catch (error) { return errorResponse(error); }
}
