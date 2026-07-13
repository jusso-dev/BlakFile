import Link from "next/link";
import { headers } from "next/headers";
import { getShareLinkAccess } from "@/domains/sharing";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1_000)} KB`;
}

export default async function ShareLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let access: Awaited<ReturnType<typeof getShareLinkAccess>> | null = null;
  try { access = await getShareLinkAccess(token, await headers()); } catch { /* Keep invalid/revoked links indistinguishable. */ }
  if (!access) return <main className="grid min-h-screen place-items-center bg-[#f5f2eb] p-5 text-[#161411]"><section className="max-w-md border border-[#d9d1c2] bg-[#fffaf0] p-7"><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#786e5e]">Secure share</p><h1 className="mt-2 text-2xl font-semibold">This link is unavailable</h1><p className="mt-3 text-sm leading-6 text-[#665f54]">It may have expired, been revoked, or reached its access limit.</p></section></main>;
  if (access.authenticationRequired) return <main className="grid min-h-screen place-items-center bg-[#f5f2eb] p-5 text-[#161411]"><section className="max-w-md border border-[#d9d1c2] bg-[#fffaf0] p-7"><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#786e5e]">Protected share</p><h1 className="mt-2 text-2xl font-semibold">Sign in to open this file</h1><p className="mt-3 text-sm leading-6 text-[#665f54]">This share link requires a BlakFile session. The file name and its contents remain protected until authentication succeeds.</p><Link href="/sign-in" className="mt-6 inline-block bg-[#b96711] px-4 py-2.5 text-sm font-semibold text-[#fff7e8]">Sign in securely</Link></section></main>;
  const file = access.file!;
  return <main className="grid min-h-screen place-items-center bg-[#f5f2eb] p-5 text-[#161411]"><section className="w-full max-w-xl border border-[#d9d1c2] bg-[#fffaf0] p-7"><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#786e5e]">Secure shared file</p><h1 className="mt-2 break-words text-3xl font-semibold tracking-tight">{file.name}</h1><p className="mt-3 text-sm text-[#665f54]">{file.mimeType} · {formatBytes(file.sizeBytes)} · {file.dataResidency}</p><dl className="mt-7 grid gap-4 border-y border-[#d9d1c2] py-5 text-sm sm:grid-cols-2"><div><dt className="text-[#665f54]">Availability</dt><dd className="mt-1 font-semibold">{file.status}</dd></div><div><dt className="text-[#665f54]">Download</dt><dd className="mt-1 font-semibold">{access.downloadEnabled ? "Allowed" : "Not allowed"}</dd></div></dl>{access.downloadEnabled ? <a href={`/api/v1/share-links/${token}/download`} className="mt-6 inline-block bg-[#b96711] px-4 py-2.5 text-sm font-semibold text-[#fff7e8]">Download file</a> : <p className="mt-6 text-sm text-[#665f54]">This link grants view-only access. Ask the sender if you need a downloadable copy.</p>}</section></main>;
}
