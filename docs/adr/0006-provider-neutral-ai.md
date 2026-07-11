# ADR 0006 — Provider-neutral, policy-gated AI

- Status: Accepted
- Date: 2026-07-11

## Context

AI must enhance file management without bypassing access controls, and must suit
regulated and Australian-sovereign organisations. Some deployments forbid sending
content to any hosted provider; some are fully air-gapped.

## Decision

- An **AI provider abstraction** with drivers: `openai`, `azure-openai`,
  `anthropic`, `google`, `bedrock`, `ollama`, `local`, `custom`, and a fully
  **disabled** mode. Provider keys stored as KMS references (`apiKeyRef`).
- **AI is off by default.** `aiPolicies` gates everything: `aiEnabled` (default
  false), `allowHostedProviders` (default false — hosted providers refuse to run
  otherwise), `allowTraining` (default false — no training on customer data),
  `allowedRegions`, `excludeClassifications`, `promptRetentionDays`.
- **Permission-aware retrieval**: every RAG query is filtered by `organisationId`
  and the caller's file permissions *before* any snippet or embedding is read.
  Search never returns unauthorised names, snippets, summaries, or embeddings.
- **Ask-Your-Files** answers cite source files + versions, record model, prompt
  template version, token usage, and the files consulted (`aiJobs`/`aiOutputs`).
- Retrieved **file content is untrusted** input — never allowed to redefine
  instructions or permissions (see `docs/agent-security-model.md`).

## Consequences

- Air-gapped/local-only installs run with Ollama or a customer endpoint and never
  egress content.
- Turning AI on is an explicit, audited org policy change, not a default.
