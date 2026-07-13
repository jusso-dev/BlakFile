"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { FileText, Folder, Link2, Plus, Share2, ShieldCheck, Upload } from "lucide-react";

type Drive = { id: string; name: string; type: string; dataResidency: string };
type FileRow = { id: string; name: string; mimeType: string; sizeBytes: number; status: string };
type FolderRow = { id: string; name: string; path: string };
type Share = {
  id: string; type: string; permissionLevel: string; recipientEmail: string | null;
  expiresAt: string | null; revokedAt: string | null;
  revocationReason: string | null;
  link: { id: string; requireAuth: boolean; downloadEnabled: boolean; expiresAt: string | null; url?: string;
    passwordProtected: boolean; allowedDomains: string[]; allowedIpRanges: string[]; allowedCountries: string[];
    accessCount: number; maxAccessCount: number | null; oneTime: boolean; consumedAt: string | null;
    accessHistory?: Array<{ action: string; country: string | null; createdAt: string; authenticated: boolean }> } | null;
  recipientInviteUrl?: string;
  recipientStatus?: "pending" | "active" | "expired" | "revoked" | "declined";
};

const formatBytes = (bytes: number) => bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1_000)} KB`;

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "content-type": "application/json", ...options?.headers } });
  if (response.status === 401) {
    window.location.assign("/sign-in");
    throw new Error("Sign in required");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Request failed");
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export function WorkspaceClient() {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [driveId, setDriveId] = useState("");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [selected, setSelected] = useState<FileRow | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [notice, setNotice] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const activeDrive = useMemo(() => drives.find((drive) => drive.id === driveId), [drives, driveId]);
  const refreshContents = useCallback(async (id: string) => {
    const data = await api<{ folders: FolderRow[]; files: FileRow[] }>(`/api/v1/drives/${id}/children`);
    setFolders(data.folders); setFiles(data.files);
  }, []);
  const refreshShares = useCallback(async (file: FileRow) => {
    setSelected(file); setShareUrl("");
    const data = await api<{ shares: Share[] }>(`/api/v1/files/${file.id}/shares`);
    setShares(data.shares);
  }, []);

  useEffect(() => {
    api<{ drives: Drive[] }>("/api/v1/drives")
      .then(async ({ drives }) => {
        setDrives(drives);
        const preferred = drives.find((drive) => drive.type === "shared") ?? drives[0];
        if (preferred) { setDriveId(preferred.id); await refreshContents(preferred.id); }
      })
      .catch((error: Error) => setNotice(error.message))
      .finally(() => setLoading(false));
  }, [refreshContents]);
  useEffect(() => { if (driveId) refreshContents(driveId).catch((error: Error) => setNotice(error.message)); }, [driveId, refreshContents]);

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    try {
      await api("/api/v1/folders", { method: "POST", body: JSON.stringify({ driveId, name: form.get("name") }) });
      formElement.reset(); await refreshContents(driveId);
      setNotice("Folder created and recorded in the audit trail.");
    } catch (error) { setNotice((error as Error).message); }
  }

  async function upload(picked: File) {
    if (!driveId) return;
    setUploading(true);
    try {
      const bytes = await picked.arrayBuffer();
      const checksum = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const session = await api<{ uploadSessionId: string; objectKey: string; upload: { url: string; headers: Record<string, string> } }>("/api/v1/uploads", {
        method: "POST", body: JSON.stringify({ driveId, ...(selected ? { fileId: selected.id } : {}), name: picked.name, sizeBytes: picked.size, mimeType: picked.type || "application/octet-stream", checksumSha256: checksum }),
      });
      const put = await fetch(session.upload.url, { method: "PUT", headers: session.upload.headers, body: picked });
      if (!put.ok) throw new Error("Storage upload failed");
      await api(`/api/v1/uploads/${session.uploadSessionId}/complete`, { method: "POST", body: JSON.stringify({ objectKey: session.objectKey, checksumSha256: checksum }) });
      await refreshContents(driveId);
      setNotice(selected ? "New version received. It is quarantined until security processing clears it." : "Upload received. It is quarantined until security processing clears it.");
    } catch (error) { setNotice((error as Error).message); } finally { setUploading(false); }
  }

  async function createShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    const formElement = event.currentTarget; const form = new FormData(formElement);
    try {
      const created = await api<Share>(`/api/v1/files/${selected.id}/shares`, {
        method: "POST",
        body: JSON.stringify({
          recipientEmail: form.get("email") || undefined,
          permissionLevel: form.get("permission"),
          createLink: form.get("link") === "on",
          downloadEnabled: form.get("download") === "on",
          requireAuth: form.get("requireAuth") === "on",
          password: form.get("password") || undefined,
          expiresAt: form.get("expiresAt") ? new Date(String(form.get("expiresAt"))).toISOString() : undefined,
          allowedDomains: String(form.get("domains") || "").split(",").map((value) => value.trim()).filter(Boolean),
          allowedIpRanges: String(form.get("ipRanges") || "").split(",").map((value) => value.trim()).filter(Boolean),
          allowedCountries: String(form.get("countries") || "").split(",").map((value) => value.trim()).filter(Boolean),
          maxAccessCount: form.get("maxAccessCount") ? Number(form.get("maxAccessCount")) : undefined,
          oneTime: form.get("oneTime") === "on",
        }),
      });
      formElement.reset(); await refreshShares(selected);
      setShareUrl(created.link?.url ?? created.recipientInviteUrl ?? "");
      setNotice(created.link ? "Authenticated share link created. Copy it now; it is shown once." : created.recipientInviteUrl ? "Recipient invitation created. Copy it now; it is shown once." : "Share created and added to the tamper-evident audit trail.");
    } catch (error) { setNotice((error as Error).message); }
  }

  async function revoke(id: string) {
    if (!selected) return;
    const reason = window.prompt("Revocation reason (recorded in audit)", "Access no longer required")?.trim();
    if (!reason) return;
    try { await api(`/api/v1/shares/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) }); await refreshShares(selected); setNotice("Share revoked with reason recorded."); }
    catch (error) { setNotice((error as Error).message); }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(shareUrl); setNotice("Share link copied."); }
    catch { setNotice("Copy the link from the field below."); }
  }
  async function signOut() { await fetch("/api/auth/sign-out", { method: "POST" }); window.location.assign("/"); }

  return <main className="min-h-screen bg-[#f5f2eb] text-[#161411]">
    <header className="flex h-16 items-center gap-4 border-b border-[#39342a] bg-[#191713] px-5 text-[#fbf3df]">
      <Link href="/" className="flex items-center gap-3 font-semibold"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#c97913] text-[#191713]"><ShieldCheck size={20}/></span>BlakFile</Link>
      <span className="hidden text-sm text-[#cfc6b4] md:block">Governed file workspace</span>
      <button onClick={signOut} className="ml-auto text-sm text-[#d9c9ac]">Sign out</button>
    </header>
    <div className="mx-auto grid max-w-7xl gap-7 p-5 lg:grid-cols-[15rem_1fr_22rem] lg:p-9">
      <aside className="border-b border-[#d9d1c2] pb-5 lg:border-b-0 lg:border-r lg:pr-5">
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#786e5e]">Spaces</p>
        <div className="mt-3 space-y-1">{drives.map((drive) => <button key={drive.id} onClick={() => setDriveId(drive.id)} className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${drive.id === driveId ? "bg-[#d8c39e] font-semibold" : "hover:bg-[#ede8dd]"}`}><Folder size={16}/>{drive.name}</button>)}</div>
      </aside>
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm font-medium text-[#8a4d13]">{activeDrive?.dataResidency ?? "Australia"}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{activeDrive?.name ?? "Your files"}</h1><p className="mt-2 text-sm text-[#665f54]">Browse records, upload a new version, and control access from one governed place.</p></div>
          <label className="inline-flex cursor-pointer items-center gap-2 bg-[#b96711] px-4 py-2.5 text-sm font-semibold text-[#fff7e8]"><Upload size={16}/>{uploading ? "Uploading…" : selected ? "Upload new version" : "Upload file"}<input className="sr-only" type="file" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) upload(file); event.currentTarget.value = ""; }} /></label>
        </div>
        {notice && <p role="status" className="mt-5 border border-[#d9c39d] bg-[#fff5df] px-3 py-2 text-sm text-[#734110]">{notice}</p>}
        <div className="mt-7 border border-[#d9d1c2] bg-[#fffaf0]">
          <div className="flex items-center justify-between border-b border-[#d9d1c2] px-5 py-4"><div><h2 className="font-semibold">Files and folders</h2><p className="mt-1 text-xs text-[#665f54]">Items are scoped to your organisation and recorded in audit.</p></div><span className="text-xs text-[#786e5e]">{files.length} files</span></div>
          {loading ? <p className="p-5 text-sm text-[#665f54]">Loading workspace…</p> : <div className="divide-y divide-[#e4dccd]">
            {folders.map((folder) => <div key={folder.id} className="flex items-center gap-3 px-5 py-3 text-sm"><Folder size={17} className="text-[#bd7213]"/>{folder.name}</div>)}
            {files.map((file) => <div key={file.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#fff5e4]"><FileText size={18} className="text-[#a75911]"/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{file.name}</span><span className="text-xs text-[#665f54]">{formatBytes(file.sizeBytes)} · {file.mimeType}</span></span><span className="rounded-full bg-[#dce8d6] px-2 py-1 text-xs text-[#375e32]">{file.status}</span><Link href={`/files/${file.id}`} className="text-xs font-semibold text-[#8a4d13]">Details</Link><button aria-label={`Manage sharing for ${file.name}`} onClick={() => refreshShares(file).catch((error: Error) => setNotice(error.message))}><Share2 size={16} className="text-[#8d8271]"/></button></div>)}
          </div>}
        </div>
        <form onSubmit={createFolder} className="mt-5 flex gap-2"><input required name="name" placeholder="New folder name" className="min-w-0 flex-1 border border-[#cfc5b5] bg-[#fffdf8] px-3 py-2 text-sm"/><button className="inline-flex items-center gap-2 border border-[#b96711] px-3 py-2 text-sm font-semibold text-[#8a4d13]"><Plus size={16}/>New folder</button></form>
      </section>
      <aside className="border border-[#d9d1c2] bg-[#fffaf0] p-5">
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#786e5e]">{selected ? "Sharing" : "Selection"}</p>
        {selected ? <><h2 className="mt-2 break-words font-semibold">{selected.name}</h2><p className="mt-1 text-sm text-[#665f54]">Create a named recipient grant or an authenticated access link.</p><Link href={`/files/${selected.id}`} className="mt-3 inline-block text-sm font-semibold text-[#8a4d13]">Open file record →</Link>
          <form className="mt-5 space-y-3" onSubmit={createShare}><label className="block text-sm font-medium">Recipient email<input name="email" type="email" placeholder="partner@example.com" className="mt-1 w-full border border-[#cfc5b5] bg-[#fffdf8] px-3 py-2"/></label><label className="block text-sm font-medium">Permission<select name="permission" defaultValue="viewer" className="mt-1 w-full border border-[#cfc5b5] bg-[#fffdf8] px-3 py-2"><option value="viewer">View only</option><option value="downloader">Download</option><option value="editor">Edit</option></select></label><div className="grid grid-cols-2 gap-2"><label className="flex gap-2 text-sm"><input name="link" type="checkbox"/>Access link</label><label className="flex gap-2 text-sm"><input name="requireAuth" type="checkbox" defaultChecked/>Require sign-in</label><label className="flex gap-2 text-sm"><input name="download" type="checkbox"/>Allow download</label><label className="flex gap-2 text-sm"><input name="oneTime" type="checkbox"/>One-time use</label></div><details className="border border-[#d9d1c2] p-3"><summary className="cursor-pointer text-sm font-semibold text-[#734110]">Link policy controls</summary><div className="mt-3 space-y-3"><label className="block text-xs font-medium">Expires<input name="expiresAt" type="datetime-local" className="mt-1 w-full border border-[#cfc5b5] bg-[#fffdf8] px-2 py-1.5 text-sm"/></label><label className="block text-xs font-medium">Password (10+ characters)<input name="password" type="password" minLength={10} autoComplete="new-password" className="mt-1 w-full border border-[#cfc5b5] bg-[#fffdf8] px-2 py-1.5 text-sm"/></label><label className="block text-xs font-medium">Maximum accesses<input name="maxAccessCount" type="number" min="1" className="mt-1 w-full border border-[#cfc5b5] bg-[#fffdf8] px-2 py-1.5 text-sm"/></label><label className="block text-xs font-medium">Allowed email domains<input name="domains" placeholder="example.com, partner.org" className="mt-1 w-full border border-[#cfc5b5] bg-[#fffdf8] px-2 py-1.5 text-sm"/></label><label className="block text-xs font-medium">Allowed IP/CIDR ranges<input name="ipRanges" placeholder="203.0.113.0/24" className="mt-1 w-full border border-[#cfc5b5] bg-[#fffdf8] px-2 py-1.5 text-sm"/></label><label className="block text-xs font-medium">Allowed country codes<input name="countries" placeholder="AU, NZ" className="mt-1 w-full border border-[#cfc5b5] bg-[#fffdf8] px-2 py-1.5 text-sm"/></label></div></details><button className="inline-flex items-center gap-2 bg-[#b96711] px-3 py-2 text-sm font-semibold text-[#fff7e8]"><Link2 size={16}/>Create share</button></form>
          {shareUrl && <div className="mt-4 border border-[#d9c39d] bg-[#fff5df] p-3"><p className="text-xs font-semibold text-[#734110]">New secure access URL</p><input readOnly value={shareUrl} aria-label="New share link" className="mt-2 w-full border border-[#cfc5b5] bg-[#fffdf8] px-2 py-1.5 text-xs"/><button onClick={copyLink} className="mt-2 text-xs font-semibold text-[#8a4d13]">Copy link</button></div>}
          <div className="mt-6 space-y-3 border-t border-[#d9d1c2] pt-4">{shares.length ? shares.map((share) => <div key={share.id} className="border-b border-[#e4dccd] pb-3 text-sm"><div className="flex gap-3"><span className="min-w-0 flex-1"><span className="block truncate font-medium">{share.recipientEmail ?? "Controlled access link"}</span><span className="text-xs capitalize text-[#665f54]">{share.permissionLevel} · {share.recipientStatus ?? (share.revokedAt ? "revoked" : "active")}</span></span>{!share.revokedAt && <button onClick={() => revoke(share.id)} className="text-xs font-semibold text-[#852e22]">Revoke</button>}</div>{share.link && <div className="mt-2 text-xs leading-5 text-[#665f54]"><p>{share.link.accessCount}{share.link.maxAccessCount ? ` / ${share.link.maxAccessCount}` : ""} accesses · {share.link.oneTime ? "one-time" : "reusable"} · {share.link.passwordProtected ? "password" : "no password"}</p><p>{share.link.expiresAt ? `Expires ${new Date(share.link.expiresAt).toLocaleString("en-AU")}` : "No expiry"}</p>{share.link.accessHistory?.length ? <details className="mt-1"><summary className="cursor-pointer font-semibold text-[#734110]">Recent access history</summary>{share.link.accessHistory.map((event, index) => <p key={`${event.createdAt}-${index}`}>{event.action} · {event.authenticated ? "signed in" : "anonymous"} · {event.country ?? "country unavailable"} · {new Date(event.createdAt).toLocaleString("en-AU")}</p>)}</details> : null}</div>}{share.revocationReason && <p className="mt-2 text-xs text-[#852e22]">Reason: {share.revocationReason}</p>}</div>) : <p className="text-sm text-[#665f54]">No shares yet.</p>}</div>
        </> : <p className="mt-3 text-sm leading-6 text-[#665f54]">Choose a file to review its access grants, create an authenticated share, or revoke access.</p>}
      </aside>
    </div>
  </main>;
}
