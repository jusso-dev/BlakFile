"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";

export default function SignInPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams(window.location.search).get("next");
    const callbackURL = next?.startsWith("/") && !next.startsWith("//") ? next : "/workspace";
    const response = await fetch("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password"), callbackURL }) });
    if (!response.ok) { setError("We could not sign you in. Check your email and password."); setBusy(false); return; }
    window.location.assign(callbackURL);
  }

  return <main className="grid min-h-screen place-items-center bg-[#f5f2eb] p-5 text-[#161411]">
    <section className="w-full max-w-md border border-[#d9d1c2] bg-[#fffaf0] p-7 shadow-sm">
      <Link href="/" className="text-sm font-semibold text-[#8a4d13]">← BlakFile</Link>
      <p className="mt-9 text-xs font-semibold uppercase tracking-[.14em] text-[#786e5e]">Secure workspace</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-3 text-sm leading-6 text-[#665f54]">Use your organisation account to access governed files and sharing controls.</p>
      <form className="mt-7 space-y-4" onSubmit={submit}>
        <label className="block text-sm font-medium">Email<input required name="email" type="email" autoComplete="email" className="mt-1.5 w-full border border-[#cfc5b5] bg-[#fffdf8] px-3 py-2.5 outline-none focus:border-[#b96711] focus:ring-2 focus:ring-[#e8c78f]" /></label>
        <label className="block text-sm font-medium">Password<input required name="password" type="password" autoComplete="current-password" className="mt-1.5 w-full border border-[#cfc5b5] bg-[#fffdf8] px-3 py-2.5 outline-none focus:border-[#b96711] focus:ring-2 focus:ring-[#e8c78f]" /></label>
        {error && <p role="alert" className="border border-[#e6bab1] bg-[#f8e1dc] px-3 py-2 text-sm text-[#852e22]">{error}</p>}
        <button disabled={busy} className="w-full bg-[#b96711] px-4 py-2.5 text-sm font-semibold text-[#fff7e8] disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="mt-6 text-sm text-[#665f54]">New to BlakFile? <Link href="/register" className="font-semibold text-[#8a4d13]">Create an organisation</Link></p>
      <p className="mt-6 text-xs leading-5 text-[#786e5e]">Demo fixture: owner@northwind.example · BlakFileDemo2026!</p>
    </section>
  </main>;
}
