import { ShareAccessClient } from "./share-access-client";

export const dynamic = "force-dynamic";

export default async function ShareLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShareAccessClient token={token}/>;
}
