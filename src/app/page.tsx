import { Shield, Lock, Bot, Boxes, ScrollText, Network } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Capability = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const capabilities: Capability[] = [
  {
    icon: Shield,
    title: "Security by default",
    description: "Hardened defaults across the platform, not an afterthought.",
  },
  {
    icon: Lock,
    title: "Privacy by design",
    description: "Data minimisation and least privilege built into the core.",
  },
  {
    icon: Bot,
    title: "AI-native (policy-gated)",
    description: "AI capabilities constrained by the same policies as users.",
  },
  {
    icon: Boxes,
    title: "Multi-tenant isolation (RLS)",
    description: "Row-level security enforces strict tenant boundaries.",
  },
  {
    icon: ScrollText,
    title: "Tamper-evident audit",
    description: "Append-only, verifiable records of every material action.",
  },
  {
    icon: Network,
    title: "API & MCP first-class",
    description: "Every capability is reachable via API and MCP interfaces.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center px-6 py-20">
      <section className="flex max-w-2xl flex-col items-center text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          BlakFile
        </h1>
        <p className="mt-4 text-lg text-[var(--muted)]">
          Secure, AI-native enterprise file platform.
        </p>
        <p className="mt-6 text-sm leading-relaxed text-[var(--muted)]">
          This is the Phase 1 foundation: authentication, organisations,
          RBAC/ABAC, storage abstraction, secure upload and download, and audit.
          It establishes the groundwork on which later capabilities are built.
        </p>
      </section>

      <section className="mt-16 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {capabilities.map((capability) => {
          const Icon = capability.icon;
          return (
            <div
              key={capability.title}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5"
            >
              <Icon className="h-5 w-5 text-[var(--foreground)]" aria-hidden />
              <h2 className="mt-3 text-sm font-medium">{capability.title}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {capability.description}
              </p>
            </div>
          );
        })}
      </section>

      <footer className="mt-20 text-center text-xs text-[var(--muted)]">
        Self-hostable · API-first · MCP-native · Australian data sovereignty
      </footer>
    </main>
  );
}
