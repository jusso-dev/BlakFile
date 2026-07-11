# MCP Security Model

BlakFile exposes a **Model Context Protocol (MCP)** server as a first-class
component, allowing external AI clients and agents to interact with organisation
content through a governed tool interface. The MCP server is built on
`@modelcontextprotocol/sdk`.

The MCP server is **not** a privileged back door. It resolves a principal and
organisation from a scoped token, and every resource and tool call is
re-authorised through the **same policy engine and shared domain services** used
by the web application, REST API, and workers. Every response returns only
authorised data, and every invocation is audited.

---

## 1. Transports

| Transport | Environment | Authentication |
| --- | --- | --- |
| `stdio` | Development / local | Local process trust |
| `http` | Production | Authenticated HTTP with scoped tokens |

The `stdio` transport is intended for local development only. In production, the
`http` transport is used with authenticated requests bearing short-lived scoped
tokens.

---

## 2. Authentication and principal resolution

Each MCP client is represented by an `mcpClients` record capturing the
`transport`, the `principalType`, the `allowedTools` allow-list, the
`allowedWorkspaces`, and a `rateLimitPerMinute`. Authentication supports:

- **Org-aware auth** — every session resolves to a specific organisation, and all
  work is tenant-scoped to that organisation.
- **OAuth authorisation** — clients obtain scoped access via OAuth.
- **Service-account auth** — non-interactive clients authenticate as service
  accounts.
- **Short-lived scoped tokens** — sessions use short-lived, scoped tokens. Only
  the `tokenHash` is stored (`mcpSessions`), never the token itself.
- **Agent identity mapping** — a session may map to an agent identity, so agent
  governance (allow-lists, budgets, approvals) applies to MCP-driven activity.
- **Rate limiting** — enforced per `rateLimitPerMinute`.
- **Tool allow-lists and workspace restrictions** — a client may call only tools
  in `allowedTools` and operate only within `allowedWorkspaces`.
- **Correlation IDs** — every session and invocation carries a `correlationId`
  for end-to-end tracing.
- **Detailed auditing** — every invocation is recorded (see §6).

---

## 3. MCP resources (permission-aware)

MCP resources expose organisation content to clients. Resource resolution is
**permission-aware**: it applies the caller's `organisationId` and effective
permissions before any content is returned, using the same permission-aware
retrieval described in [`ai-privacy-model.md`](./ai-privacy-model.md). A client
never sees names, metadata, previews, or content for resources it is not
authorised to access.

---

## 4. MCP tools

Every tool call is validated, re-authorised through the policy engine, executed
via a shared domain service, and logged. Tools marked **destructive / high-risk**
require confirmation/approval before they take effect (subject to the client's
and, where mapped, the agent's approval settings).

### Read / navigation tools

| Tool | Risk |
| --- | --- |
| `search_files` | Read (permission-filtered) |
| `list_workspaces` | Read |
| `list_folder` | Read |
| `get_file_metadata` | Read |
| `get_file_content` | Read |
| `get_file_preview` | Read |
| `get_file_versions` | Read |
| `compare_file_versions` | Read |
| `find_duplicates` | Read |

### AI tools

| Tool | Risk |
| --- | --- |
| `summarise_file` | Read + AI (subject to `aiPolicies`) |
| `ask_files` | Read + AI (permission-filtered, cited) |
| `propose_file_organisation` | Read + proposal (no changes applied) |

### Write / mutating tools

| Tool | Risk |
| --- | --- |
| `create_folder` | Write |
| `upload_file` | Write |
| `create_upload_session` | Write |
| `move_file` | **Destructive — confirmation/approval** |
| `copy_file` | Write |
| `rename_file` | **Destructive — confirmation/approval** |
| `tag_file` | Write |
| `classify_file` | Write |
| `add_comment` | Write |
| `create_file_request` | Write |
| `create_data_room` | Write |
| `create_review_request` | Write |

### Sharing / access-control tools (high-risk)

| Tool | Risk |
| --- | --- |
| `share_file` | **High-risk — confirmation/approval** |
| `revoke_share` | **High-risk — confirmation/approval** |
| `request_access` | Write (request only) |
| `approve_access` | **High-risk — confirmation/approval** |

### Agent-run control tools

| Tool | Risk |
| --- | --- |
| `create_agent_run` | **High-risk — confirmation/approval** |
| `approve_agent_run` | **High-risk — confirmation/approval** |
| `cancel_agent_run` | Control |

Destructive and high-risk tools (sharing, revocation, access approval, moves and
renames, and agent-run creation/approval) never take effect from a single
unattended call unless organisation policy explicitly permits the corresponding
autonomous action; otherwise they are proposed for human confirmation.

---

## 5. Governed prompt templates

MCP prompt templates are **governed and versioned**. Templates are managed
artefacts with explicit versions, and the version in use is recorded alongside
the resulting AI job so any AI-assisted MCP interaction is reproducible and
auditable.

---

## 6. Response and audit guarantees

- **Authorised data only.** Every MCP response returns only data the resolved
  principal is authorised to access.
- **No raw storage credentials.** MCP never returns raw storage credentials or
  KMS material; content is served through the storage abstraction.
- **Re-authorisation per invocation.** Each tool invocation is re-authorised via
  the same policy engine (`canX` checks) used everywhere else.
- **Complete logging.** Each invocation is recorded to `mcpToolInvocations`
  (`toolKey`, `argsRedacted`, `outcome`, `authorised`, `resourceType` /
  `resourceId`, `correlationId`) and to the append-only, hash-chained
  `auditEvents` trail.

---

## 7. MCP authorisation flow

```mermaid
sequenceDiagram
    autonumber
    participant Client as MCP client
    participant MCP as MCP server (stdio / http)
    participant Auth as Token verification
    participant Policy as Policy engine (allowlist + canX)
    participant Domain as Shared domain service
    participant Log as mcpToolInvocations
    participant Audit as auditEvents (hash-chained)

    Client->>MCP: Connect with scoped token (OAuth / service account)
    MCP->>Auth: Verify token (tokenHash lookup, scope, expiry)
    Auth-->>MCP: Principal + organisation + (optional) agent identity
    Note right of MCP: mcpSessions created with correlationId;<br/>rateLimitPerMinute enforced

    Client->>MCP: Invoke tool (toolKey, args)
    MCP->>Policy: Check allowedTools + allowedWorkspaces + canX(org, principal, resource)
    Note right of Policy: destructive/high-risk → confirmation/approval
    alt authorised
        Policy-->>MCP: Permitted
        MCP->>Domain: Execute via shared domain service
        Domain-->>MCP: Authorised result (no raw storage creds)
        MCP->>Log: mcpToolInvocation (toolKey, argsRedacted, outcome, authorised=true, resource, correlationId)
        MCP->>Audit: Append audit event
        MCP-->>Client: Authorised result
    else denied
        Policy-->>MCP: Denied
        MCP->>Log: mcpToolInvocation (authorised=false)
        MCP->>Audit: Append audit event
        MCP-->>Client: Policy-denied (no leakage)
    end
```

---

## Related documents

- [`ai-privacy-model.md`](./ai-privacy-model.md) — permission-aware retrieval behind `ask_files` and `summarise_file`.
- [`agent-security-model.md`](./agent-security-model.md) — governance applied via `create_agent_run` / `approve_agent_run` / `cancel_agent_run`.
- [`api-and-auth.md`](./api-and-auth.md) — OAuth clients, service accounts, and credential handling shared with MCP.
