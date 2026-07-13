"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Access = { authenticationRequired: boolean; passwordRequired?: boolean;
  file?: { name: string; mimeType: string; sizeBytes: number; status: string; dataResidency: string }; downloadEnabled?: boolean };
const formatBytes = (bytes: number) => bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1_000)} KB`;

export function ShareAccessClient({ token }: { token: string }) {
  const [access, setAccess] = useState<Access | null>();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async (secret?: string) => {
    const response = await fetch(`/api/v1/share-links/${encodeURIComponent(token)}`, { headers: secret ? { "x-share-password": secret } : {} });
    if (!response.ok) { setAccess(null); setMessage(response.status === 403 ? "The password or access policy did not match." : ""); return; }
    setAccess(await response.json()); setMessage("");
  }, [token]);
  useEffect(() => { load(); }, [load]);
  async function download() {
    const response = await fetch(`/api/v1/share-links/${encodeURIComponent(token)}/download`, { headers: password ? { "x-share-password": password } : {} });
    if (!response.ok) { setMessage("The file could not be downloaded under this link's current policy."); return; }
    const result = await response.json(); window.location.assign(result.url);
  }
  const shell = (children: React.ReactNode) => <main className="grid min-h-screen place-items-center bg-[#f5f2eb] p-5 text-[#161411]"><section className="w-full max-w-xl border border-[#d9d1c2] bg-[#fffaf0] p-7">{children}</section></main>;
  if (access === undefined) return shell(<p className="text-sm text-[#665f54]">Checking secure access…</p>);
  if (access === null) return shell(<><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#786e5e]">Secure share</p><h1 className="mt-2 text-2xl font-semibold">This link is unavailable</h1><p className="mt-3 text-sm leading-6 text-[#665f54]">It may have expired, been revoked, reached its limit, or failed an access policy.</p>{message && <p role="alert" className="mt-4 border border-[#d8a69e] bg-[#fff0ed] p-3 text-sm text-[#852e22]">{message}</p>}</>);
  if (access.authenticationRequired) return shell(<><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#786e5e]">Protected share</p><h1 className="mt-2 text-2xl font-semibold">Sign in to open this file</h1><p className="mt-3 text-sm leading-6 text-[#665f54]">This link requires an authenticated BlakFile session before any file details are disclosed.</p><Link href="/sign-in" className="mt-6 inline-block bg-[#b96711] px-4 py-2.5 text-sm font-semibold text-[#fff7e8]">Sign in securely</Link></>);
  if (access.passwordRequired) return shell(<form onSubmit={(event) => { event.preventDefault(); load(password); }}><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#786e5e]">Password protected</p><h1 className="mt-2 text-2xl font-semibold">Enter the share password</h1><p className="mt-3 text-sm leading-6 text-[#665f54]">The password is sent in a protected request header and is never included in the URL.</p><label className="mt-5 block text-sm font-medium">Share password<input autoFocus required minLength={10} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full border border-[#cfc5b5] bg-[#fffdf8] px-3 py-2"/></label>{message && <p role="alert" className="mt-3 text-sm text-[#852e22]">{message}</p>}<button className="mt-5 bg-[#b96711] px-4 py-2.5 text-sm font-semibold text-[#fff7e8]">Unlock securely</button></form>);
  const file = access.file!;
  return shell(<><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#786e5e]">Secure shared file</p><h1 className="mt-2 break-words text-3xl font-semibold tracking-tight">{file.name}</h1><p className="mt-3 text-sm text-[#665f54]">{file.mimeType} · {formatBytes(file.sizeBytes)} · {file.dataResidency}</p><dl className="mt-7 grid gap-4 border-y border-[#d9d1c2] py-5 text-sm sm:grid-cols-2"><div><dt className="text-[#665f54]">Availability</dt><dd className="mt-1 font-semibold">{file.status}</dd></div><div><dt className="text-[#665f54]">Download</dt><dd className="mt-1 font-semibold">{access.downloadEnabled ? "Allowed" : "Not allowed"}</dd></div></dl>{message && <p role="alert" className="mt-4 text-sm text-[#852e22]">{message}</p>}{access.downloadEnabled ? <button onClick={download} className="mt-6 bg-[#b96711] px-4 py-2.5 text-sm font-semibold text-[#fff7e8]">Download file</button> : <p className="mt-6 text-sm text-[#665f54]">This link grants view-only access.</p>}</>);
}
