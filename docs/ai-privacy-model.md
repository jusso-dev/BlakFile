# AI Privacy Model

This document describes how BlakFile applies artificial intelligence to customer
content while preserving tenant isolation, access control, data residency, and
the guarantee that customer data is never used to train third-party models.

BlakFile is an AI-native platform, but AI is a **governed capability, not an
ambient one**. The web application, REST API, MCP server, and background workers
all consume the **same domain services**, so every AI-privacy control described
here is enforced uniformly regardless of the entry point.

---

## 1. Provider abstraction and provider-neutral design

BlakFile never hard-codes a single AI vendor. All model interactions are routed
through a provider-neutral driver interface. Supported drivers are:

| Driver | Hosting | Typical use |
| --- | --- | --- |
| `openai` | Hosted | General-purpose hosted inference |
| `azure-openai` | Hosted (region-pinned) | Enterprise hosted inference with regional control |
| `anthropic` | Hosted | General-purpose hosted inference |
| `google` | Hosted | General-purpose hosted inference |
| `bedrock` | Hosted (region-pinned) | Hosted inference with regional control |
| `ollama` | Local | On-premises / in-VPC inference, no egress |
| `local` | Local | Self-managed local model runtime |
| `custom` | Customer-defined | Customer-provided endpoint |

Each configured provider is represented by an `aiProviders` record capturing the
`driver`, an `apiKeyRef` (a **reference to a key held in the KMS**, never the raw
secret), an `isHosted` flag, and the processing `region`. Because the platform
depends only on the driver interface, an organisation can substitute or remove a
provider without any change to application code or stored content.

> **AI is DISABLED by default.** A newly provisioned organisation performs **no
> AI processing** of any kind until an administrator explicitly opts in through
> policy. There is no default hosted provider and no default egress of content.

---

## 2. Policy gating (`aiPolicies`)

Every AI action is evaluated against the organisation's `aiPolicies` record
before any content is read or transmitted. The relevant fields and their
defaults are:

| Field | Default | Effect |
| --- | --- | --- |
| `aiEnabled` | `false` | Master switch. When false, no AI processing occurs. |
| `allowHostedProviders` | `false` | When false, only **local** drivers (`ollama`, `local`) may run. Hosted drivers are refused. |
| `allowTraining` | `false` | Governs whether any provider may retain content for model improvement. Always sent as "do not train"; see the no-training guarantee below. |
| `allowedRegions` | (unset) | Allow-list of processing regions. A provider whose `region` is not listed is refused. |
| `excludeClassifications` | (unset) | Classifications that must never be sent to AI or indexed for AI retrieval. |
| `promptRetentionDays` | (org-set) | Retention window for prompts and responses. |

### Fully-disabled mode

With `aiEnabled = false`, the AI subsystem is inert. No embeddings are generated,
no retrieval is served to AI features, no provider is contacted, and AI-only
endpoints return a policy-denied response. This is the shipping default.

### Local-only mode

With `aiEnabled = true` and `allowHostedProviders = false`, only local drivers
run. Content never leaves the organisation's trust boundary. This lets an
organisation adopt AI features (Ask-Your-Files, summarisation, embeddings) with
**zero content egress** to any external vendor.

### Hosted mode

Hosted drivers run only when `aiEnabled = true` **and**
`allowHostedProviders = true` **and** the provider's `region` is within
`allowedRegions`. All three conditions are re-checked at request time by
`canUseAIWithFile`.

---

## 3. No-training guarantee

BlakFile does not train models on customer data, and does not permit its
providers to do so. `allowTraining` defaults to `false`, and every hosted request
is issued with explicit no-retention / no-training signalling. Customer content,
prompts, and generated outputs are treated as confidential tenant data at all
times. Where a hosted driver cannot contractually or technically guarantee
no-training behaviour, that driver is not eligible for hosted mode.

---

## 4. Classification exclusion and AI-indexing exclusion

`excludeClassifications` provides a hard boundary. Any file version carrying an
excluded classification is:

- never embedded or indexed for AI retrieval;
- never included in permission-filtered retrieval results;
- never sent to any provider, hosted or local.

This exclusion is applied at **indexing time** (the content never enters the
vector store) and re-checked at **query time** (already-indexed content whose
classification later becomes excluded is filtered out). Search and AI indexing
therefore share the same exclusion semantics.

---

## 5. Prompt and response retention (`promptRetentionDays`)

Prompts submitted to AI features and the responses returned are retained only for
`promptRetentionDays`. `aiOutputs` records carry a `retentionExpiresAt` timestamp
derived from this policy; background workers purge expired prompts and outputs.
Retention is per-organisation and independent of the underlying file retention.

---

## 6. Permission-aware retrieval (RAG)

Retrieval is the most privacy-sensitive path in the platform, because it decides
which content is assembled into a model's context window. BlakFile enforces
permissions **before** any snippet, embedding, or summary is read — never after.

Rules:

1. **Tenant scoping first.** Every retrieval query is bound to the caller's
   `organisationId`. Embeddings bind to a `fileVersion` and carry the owning
   `organisationId`; cross-tenant retrieval is structurally impossible.
2. **ACL filtering before read.** The caller's effective file permissions are
   resolved and applied as a filter on the vector and full-text search **before**
   candidate content is materialised. Unauthorised vectors are never scored,
   ranked, or decrypted into context.
3. **No leakage of the unauthorised.** Search and AI features never return the
   **names, snippets, summaries, or embeddings** of files the caller cannot
   access. Absence is indistinguishable from non-existence.
4. **Classification exclusion applies.** Excluded classifications are removed in
   addition to ACL filtering.

The same permission-aware retrieval service backs search, Ask-Your-Files,
summarisation, and any agent or MCP retrieval — there is no privileged retrieval
path that bypasses these checks.

---

## 7. Ask-Your-Files

Ask-Your-Files answers natural-language questions over the organisation's
content. Its behaviour is defined by the following guarantees:

- **Cited answers.** Each answer cites its source **files and file versions**,
  with the specific locations used. Citations are stored on `aiOutputs`
  (`citations` = source `fileVersionIds` + locations).
- **Authorised links only.** Citation links resolve to locations the caller is
  authorised to open. The system never surfaces a link, name, or excerpt for a
  source the caller cannot access.
- **Insufficient-evidence honesty.** When authorised content does not support an
  answer, Ask-Your-Files states that the evidence is insufficient rather than
  fabricating one or drawing on inaccessible material.
- **Full accountability.** Every answer records the files consulted, the `model`,
  the `promptTemplateVersion`, token usage (`inputTokens` / `outputTokens`), the
  `correlationId`, and the requesting user and organisation via `aiJobs` and
  `aiOutputs`.

Because retrieval is permission-filtered before context assembly, an answer can
only ever be grounded in content the asker is already entitled to read.

---

## 8. Data minimisation and residency

- **Data minimisation.** Only the minimum content required to satisfy a request
  is retrieved and sent to a provider. Whole-repository or whole-tenant context
  is never assembled.
- **Configurable processing regions.** `allowedRegions` and each provider's
  `region` let an organisation pin AI processing to specific jurisdictions.
- **Customer-provided endpoints.** The `custom` driver and local drivers allow an
  organisation to route inference to its own endpoint, keeping content within its
  own infrastructure and contracts.

---

## 9. Untrusted content

Retrieved file content is **untrusted input**. It is assembled into the model
context clearly separated from system instructions, and is never permitted to
alter policy, permissions, or provider selection. See
[`agent-security-model.md`](./agent-security-model.md) for the full
prompt-injection defence catalogue, which applies equally to Ask-Your-Files.

---

## 10. AI retrieval flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant App as Domain service (web / API / MCP / worker)
    participant Policy as Policy engine (canUseAIWithFile)
    participant Retrieval as Permission-aware retrieval
    participant Vec as pgvector + FTS
    participant Provider as AI provider (local / hosted)
    participant Store as aiJobs / aiOutputs
    participant Audit as auditEvents (hash-chained)

    User->>App: Ask-Your-Files question
    App->>Policy: canUseAIWithFile(org, user, scope)
    Note right of Policy: Checks aiEnabled, provider hosting vs<br/>allowHostedProviders, region in allowedRegions,<br/>excludeClassifications
    Policy-->>App: Permitted (provider selected)

    App->>Retrieval: Retrieve(org, user, question)
    Retrieval->>Vec: Query filtered by organisationId + ACL + exclusions
    Note right of Vec: Unauthorised names / snippets /<br/>embeddings never read
    Vec-->>Retrieval: Authorised candidates only
    Retrieval-->>App: Context (content marked UNTRUSTED)

    App->>Provider: System instructions + untrusted context
    Note right of Provider: no-training signalled;<br/>local = no egress
    Provider-->>App: Answer + grounding

    App->>Store: Record aiJob (model, promptTemplateVersion, tokens, correlationId)
    App->>Store: Record aiOutput (content, citations = fileVersionIds + locations, retentionExpiresAt)
    App->>Audit: Append AI event (attributable to user + org)
    App-->>User: Answer with citations to authorised sources
```

---

## Related documents

- [`agent-security-model.md`](./agent-security-model.md) — governed agent identities and prompt-injection defences.
- [`mcp-security-model.md`](./mcp-security-model.md) — MCP tool authorisation, including `ask_files` and `summarise_file`.
- [`api-and-auth.md`](./api-and-auth.md) — authentication, DTO boundaries, and webhooks.
