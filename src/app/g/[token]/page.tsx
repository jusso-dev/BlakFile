"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Access = { authenticationRequired: boolean; status: "pending" | "active"; recipientEmail?: string;
  permissionLevel?: string; downloadEnabled?: boolean; expiresAt?: string;
  file?: { id: string; name: string; mimeType: string; sizeBytes: number; status: string } };

export default function GuestInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState(""); const [access, setAccess] = useState<Access | null>(null);
  const [message, setMessage] = useState("Checking this secure invitation…"); const [busy, setBusy] = useState(false);
  async function load(value: string) {
    const response = await fetch(`/api/v1/invitations/${value}`);
    if (!response.ok) { setMessage(response.status === 403 ? "This invitation was sent to a different account." : "This invitation is no longer available."); return; }
    setAccess(await response.json()); setMessage("");
  }
  useEffect(() => { params.then(({ token }) => { setToken(token); return load(token); }).catch(() => setMessage("This invitation is unavailable.")); }, [params]);
  async function decide(action: "accept" | "decline") {
    setBusy(true); const response = await fetch(`/api/v1/invitations/${token}/${action}`, { method: "POST" });
    if (response.ok && action === "accept") await load(token); else if (response.ok) { setAccess(null); setMessage("Invitation declined. No access was granted."); }
    else setMessage("The invitation could not be updated."); setBusy(false);
  }
  async function download() {
    const response = await fetch(`/api/v1/invitations/${token}/download`);
    if (!response.ok) { setMessage("This file is not available for download."); return; }
    window.location.assign((await response.json()).url);
  }
  return <main className="grid min-h-screen place-items-center bg-[#f5f2eb] p-5 text-[#161411]"><section className="w-full max-w-lg border border-[#d9d1c2] bg-[#fffaf0] p-7">
    <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#786e5e]">Secure recipient invitation</p>
    <h1 className="mt-2 text-2xl font-semibold">{access?.status === "active" ? access.file?.name : "A governed file was shared with you"}</h1>
    {message && <p role="status" className="mt-3 text-sm leading-6 text-[#665f54]">{message}</p>}
    {access?.authenticationRequired && <><p className="mt-3 text-sm leading-6 text-[#665f54]">Sign in with the exact email address that received this invitation.</p><Link href={`/sign-in?next=/g/${token}`} className="mt-6 inline-block bg-[#b96711] px-4 py-2.5 text-sm font-semibold text-[#fff7e8]">Sign in securely</Link></>}
    {access && !access.authenticationRequired && access.status === "pending" && <><dl className="mt-5 border-y border-[#e4dccd] py-4 text-sm"><div><dt className="text-[#786e5e]">Recipient</dt><dd className="mt-1 font-medium">{access.recipientEmail}</dd></div><div className="mt-3"><dt className="text-[#786e5e]">Permission</dt><dd className="mt-1 font-medium capitalize">{access.permissionLevel}</dd></div></dl><div className="mt-6 flex gap-3"><button disabled={busy} onClick={() => decide("accept")} className="bg-[#b96711] px-4 py-2.5 text-sm font-semibold text-[#fff7e8]">Accept access</button><button disabled={busy} onClick={() => decide("decline")} className="border border-[#9f9381] px-4 py-2.5 text-sm font-semibold">Decline</button></div></>}
    {access?.status === "active" && <><p className="mt-3 text-sm text-[#665f54]">{access.file?.mimeType} · {access.permissionLevel} access · {access.file?.status}</p><div className="mt-6 flex gap-3">{access.downloadEnabled && <button onClick={download} className="bg-[#b96711] px-4 py-2.5 text-sm font-semibold text-[#fff7e8]">Download file</button>}<button onClick={() => window.location.reload()} className="border border-[#9f9381] px-4 py-2.5 text-sm font-semibold">Refresh status</button></div></>}
  </section></main>;
}
