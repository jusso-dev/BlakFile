"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function GuestInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState(""); const [message, setMessage] = useState("Checking invitation…"); const [ready, setReady] = useState(false);
  useEffect(() => { params.then(async ({ token }) => { setToken(token); const response = await fetch(`/api/v1/invitations/${token}/accept`, { method: "POST" });
    if (response.status === 401) { setMessage("Sign in with the invited email to accept this share."); return; }
    if (!response.ok) { setMessage("This invitation is unavailable or was sent to a different account."); return; }
    setMessage("Access accepted. The sender can now see that this recipient grant is active."); setReady(true);
  }).catch(() => setMessage("This invitation is unavailable.")); }, [params]);
  return <main className="grid min-h-screen place-items-center bg-[#f5f2eb] p-5 text-[#161411]"><section className="max-w-md border border-[#d9d1c2] bg-[#fffaf0] p-7"><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#786e5e]">Secure recipient invitation</p><h1 className="mt-2 text-2xl font-semibold">{ready ? "Share accepted" : "Sign in required"}</h1><p className="mt-3 text-sm leading-6 text-[#665f54]">{message}</p>{!ready && token && <Link href={`/sign-in?next=/g/${token}`} className="mt-6 inline-block bg-[#b96711] px-4 py-2.5 text-sm font-semibold text-[#fff7e8]">Sign in securely</Link>} {ready && <Link href="/workspace" className="mt-6 inline-block text-sm font-semibold text-[#8a4d13]">Open workspace →</Link>}</section></main>;
}
