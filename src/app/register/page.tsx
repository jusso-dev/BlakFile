"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";

export default function RegisterPage() {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    const signUp = await fetch("/api/auth/sign-up/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password") }) });
    if (!signUp.ok) { setError("We could not create your account. Try a different email or password."); setBusy(false); return; }
    const organisation = await fetch("/api/v1/onboarding/organisation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("organisation") }) });
    if (!organisation.ok) { setError("Your account was created, but workspace setup needs attention."); setBusy(false); return; }
    window.location.assign("/workspace");
  }
  return <main className="grid min-h-screen place-items-center bg-[#f5f2eb] p-5 text-[#161411]"><section className="w-full max-w-md border border-[#d9d1c2] bg-[#fffaf0] p-7 shadow-sm"><Link href="/" className="text-sm font-semibold text-[#8a4d13]">← BlakFile</Link><p className="mt-9 text-xs font-semibold uppercase tracking-[.14em] text-[#786e5e]">New workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Create your organisation</h1><form className="mt-7 space-y-4" onSubmit={submit}><label className="block text-sm font-medium">Your name<input required name="name" className="mt-1.5 w-full border border-[#cfc5b5] bg-[#fffdf8] px-3 py-2.5"/></label><label className="block text-sm font-medium">Work email<input required name="email" type="email" className="mt-1.5 w-full border border-[#cfc5b5] bg-[#fffdf8] px-3 py-2.5"/></label><label className="block text-sm font-medium">Password<input required minLength={8} name="password" type="password" className="mt-1.5 w-full border border-[#cfc5b5] bg-[#fffdf8] px-3 py-2.5"/></label><label className="block text-sm font-medium">Organisation name<input required name="organisation" className="mt-1.5 w-full border border-[#cfc5b5] bg-[#fffdf8] px-3 py-2.5"/></label>{error && <p role="alert" className="border border-[#e6bab1] bg-[#f8e1dc] px-3 py-2 text-sm text-[#852e22]">{error}</p>}<button disabled={busy} className="w-full bg-[#b96711] px-4 py-2.5 text-sm font-semibold text-[#fff7e8] disabled:opacity-60">{busy ? "Creating workspace…" : "Create secure workspace"}</button></form><p className="mt-6 text-sm text-[#665f54]">Already have an account? <Link href="/sign-in" className="font-semibold text-[#8a4d13]">Sign in</Link></p></section></main>;
}
