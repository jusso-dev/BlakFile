import { desc, eq } from "drizzle-orm";
import { Bell, ChevronRight, FileText, Folder, LayoutGrid, Search, ShieldCheck, Upload } from "lucide-react";
import { db, schema, withOrg } from "@/db";

export const dynamic = "force-dynamic";

const formatBytes = (bytes: number) =>
  bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1_000)} KB`;

async function workspaceData() {
  try {
    const [organisation] = await db.select().from(schema.organisations)
      .where(eq(schema.organisations.slug, "northwind")).limit(1);
    if (!organisation) return null;
    return withOrg(organisation.id, async (tx) => ({
      organisation,
      drives: await tx.select().from(schema.drives).where(eq(schema.drives.organisationId, organisation.id)),
      folders: await tx.select().from(schema.folders).where(eq(schema.folders.organisationId, organisation.id)),
      files: await tx.select().from(schema.files).where(eq(schema.files.organisationId, organisation.id))
        .orderBy(desc(schema.files.updatedAt)),
    }));
  } catch {
    return null;
  }
}

export default async function Home() {
  const data = await workspaceData();
  const files = data?.files ?? [];
  const folders = data?.folders ?? [];
  const organisation = data?.organisation.name ?? "Northwind Regional Health";
  const available = files.filter((file) => file.status === "available").length;

  return <main className="min-h-screen bg-[#f5f2eb] text-[#161411]">
    <header className="flex h-16 items-center gap-5 border-b border-[#d9d1c2] bg-[#191713] px-5 text-[#fbf3df]">
      <div className="flex items-center gap-3 font-semibold tracking-tight"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#c97913] text-[#191713]"><ShieldCheck size={20}/></span><span>BlakFile</span></div>
      <div className="hidden items-center gap-2 rounded-md bg-[#2a2721] px-3 py-2 text-sm text-[#cfc6b4] md:flex md:w-[31rem]"><Search size={16}/><span>Search this workspace</span></div>
      <div className="ml-auto flex items-center gap-4"><Bell size={18}/><span className="grid h-8 w-8 place-items-center rounded-full bg-[#e8dfcc] text-sm font-semibold text-[#2e261b]">AO</span></div>
    </header>
    <div className="flex">
      <aside className="hidden min-h-[calc(100vh-4rem)] w-60 border-r border-[#d9d1c2] bg-[#ede8dd] p-4 md:block">
        <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-[.14em] text-[#786e5e]">{organisation}</p>
        <nav className="space-y-1 text-sm"><a className="flex items-center gap-3 rounded-md bg-[#d8c39e] px-3 py-2 font-semibold" href="#overview"><LayoutGrid size={17}/>Overview</a><a className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-[#e3dccf]" href="#files"><Folder size={17}/>Shared files</a><a className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-[#e3dccf]" href="#activity"><ShieldCheck size={17}/>Security activity</a></nav>
        <div className="mt-8 border-t border-[#d9d1c2] pt-5"><p className="px-3 text-xs font-semibold uppercase tracking-[.14em] text-[#786e5e]">Spaces</p>{data?.drives.map((drive) => <div className="mt-2 flex items-center gap-3 px-3 text-sm" key={drive.id}><Folder size={16} className="text-[#bd7213]"/>{drive.name}</div>)}</div>
      </aside>
      <section className="min-w-0 flex-1 p-5 md:p-9">
        <div id="overview" className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-sm font-medium text-[#8a4d13]">Northwind Regional Health</p><h1 className="text-3xl font-semibold tracking-tight">Shared workspace</h1><p className="mt-2 max-w-2xl text-sm text-[#665f54]">A governed home for regional planning, clinical governance, and operational records.</p></div><button className="inline-flex items-center gap-2 rounded-md bg-[#b96711] px-4 py-2.5 text-sm font-semibold text-[#fff7e8]"><Upload size={16}/>Upload files</button></div>
        <div className="grid gap-4 md:grid-cols-3"><div className="border border-[#d9d1c2] bg-[#fffaf0] p-5"><p className="text-sm text-[#665f54]">Protected records</p><p className="mt-2 text-3xl font-semibold">{files.length}</p><p className="mt-2 text-xs text-[#8a4d13]">{available} scanned and available</p></div><div className="border border-[#d9d1c2] bg-[#fffaf0] p-5"><p className="text-sm text-[#665f54]">Folders in this space</p><p className="mt-2 text-3xl font-semibold">{folders.length}</p><p className="mt-2 text-xs text-[#665f54]">Structured for records retention</p></div><div className="border border-[#d9d1c2] bg-[#2c271f] p-5 text-[#fff7e8]"><p className="text-sm text-[#d9c9ac]">Data residency</p><p className="mt-2 text-xl font-semibold">Australia</p><p className="mt-2 text-xs text-[#d9c9ac]">ap-southeast-2 · policy verified</p></div></div>
        <div id="files" className="mt-9 border border-[#d9d1c2] bg-[#fffaf0]"><div className="flex items-center justify-between border-b border-[#d9d1c2] px-5 py-4"><div><h2 className="font-semibold">Shared files</h2><p className="mt-1 text-xs text-[#665f54]">Current records in the Northwind shared drive</p></div><button className="text-sm font-semibold text-[#8a4d13]">View all</button></div><div className="divide-y divide-[#e4dccd]">{files.map((file) => <div className="flex items-center gap-3 px-5 py-4" key={file.id}><span className="grid h-9 w-9 place-items-center rounded bg-[#f0e3cc] text-[#a75911]"><FileText size={18}/></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{file.name}</p><p className="mt-1 text-xs text-[#665f54]">{formatBytes(file.sizeBytes)} · {file.sourceSystem ?? "BlakFile"}</p></div><span className={file.status === "restricted" ? "rounded-full bg-[#f3d8d2] px-2 py-1 text-xs font-medium text-[#852e22]" : "rounded-full bg-[#dce8d6] px-2 py-1 text-xs font-medium text-[#375e32]"}>{file.status === "restricted" ? "Restricted" : "Available"}</span><ChevronRight size={17} className="text-[#8d8271]"/></div>)}</div></div>
        <div id="activity" className="mt-8 border-t border-[#d9d1c2] pt-6"><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#786e5e]">Security activity</p><p className="mt-2 text-sm">All listed records are tenant-scoped, malware checked, and retained in the Australian region.</p></div>
      </section>
    </div>
  </main>;
}
