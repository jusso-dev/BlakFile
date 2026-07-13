import { guestInvitationStatus } from "@/domains/sharing";
import { errorResponse, json } from "@/lib/http";

export const runtime = "nodejs";
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  try { return json(await guestInvitationStatus((await params).token, req.headers)); }
  catch (error) { return errorResponse(error); }
}
