/** HTTP-level recipient grant acceptance test against a running app. */
const base = process.env.SMOKE_APP_URL ?? "http://localhost:33002";
const apiKey = process.env.SMOKE_API_KEY;
if (!apiKey) throw new Error("SMOKE_API_KEY is required");

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`GUEST SMOKE FAIL: ${message}`);
}

async function json<T>(path: string, init: RequestInit = {}): Promise<{ response: Response; body: T }> {
  const response = await fetch(`${base}${path}`, init);
  const body = await response.json().catch(() => null) as T;
  return { response, body };
}

async function signUp(email: string): Promise<string> {
  const { response } = await json("/api/auth/sign-up/email", { method: "POST", headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ name: email.split("@")[0], email, password: "Guest-Smoke-Password-2026!" }) });
  assert(response.ok, `sign-up succeeded for ${email} (${response.status})`);
  const cookie = response.headers.get("set-cookie")?.match(/blakfile\.session_token=[^;,]+/)?.[0];
  assert(cookie, "session cookie returned");
  return cookie;
}

async function createInvite(fileId: string, email: string, expiresAt?: string) {
  const { response, body } = await json<{ id: string; recipientInviteUrl?: string }>(`/api/v1/files/${fileId}/shares`, {
    method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ recipientEmail: email, permissionLevel: "downloader", createLink: false, downloadEnabled: true, ...(expiresAt ? { expiresAt } : {}) }),
  });
  assert(response.status === 201 && body.recipientInviteUrl, "recipient invitation created");
  return { shareId: body.id, token: new URL(body.recipientInviteUrl).pathname.split("/").pop()! };
}

async function main() {
  const authz = { authorization: `Bearer ${apiKey}` };
  const drives = await json<{ drives: Array<{ id: string; type: string }> }>("/api/v1/drives", { headers: authz });
  const driveId = drives.body.drives.find((drive) => drive.type === "shared")?.id; assert(driveId, "shared drive available");
  const contents = await json<{ files: Array<{ id: string; status: string }> }>(`/api/v1/drives/${driveId}/children`, { headers: authz });
  let fileId: string | undefined;
  for (const file of contents.body.files.filter((candidate) => candidate.status === "available")) {
    const detail = await json<{ versions: unknown[] }>(`/api/v1/files/${file.id}`, { headers: authz });
    if (detail.response.ok && detail.body.versions.length) { fileId = file.id; break; }
  }
  assert(fileId, "available file with a stored version exists");
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const recipientEmail = `guest-${suffix}@example.com`; const unrelatedEmail = `other-${suffix}@example.com`;
  const recipientCookie = await signUp(recipientEmail); const unrelatedCookie = await signUp(unrelatedEmail);

  const first = await createInvite(fileId, recipientEmail);
  let access = await json<{ status: string; authenticationRequired: boolean }>(`/api/v1/invitations/${first.token}`, { headers: { cookie: recipientCookie } });
  assert(access.response.ok && access.body.status === "pending" && !access.body.authenticationRequired, "intended recipient sees pending grant");
  const unrelated = await json(`/api/v1/invitations/${first.token}`, { headers: { cookie: unrelatedCookie } });
  assert(unrelated.response.status === 403, "unrelated signed-in account is denied");
  const accepted = await fetch(`${base}/api/v1/invitations/${first.token}/accept`, { method: "POST", headers: { cookie: recipientCookie } });
  assert(accepted.status === 204, "recipient accepted grant");
  access = await json(`/api/v1/invitations/${first.token}`, { headers: { cookie: recipientCookie } });
  assert(access.response.ok && access.body.status === "active", "accepted grant is active");
  const download = await json<{ url?: string }>(`/api/v1/invitations/${first.token}/download`, { headers: { cookie: recipientCookie } });
  assert(download.response.ok && download.body.url?.startsWith("http"), `recipient download policy mints a signed URL (${download.response.status})`);

  const revoked = await fetch(`${base}/api/v1/shares/${first.shareId}`, { method: "DELETE", headers: authz });
  assert(revoked.status === 204, "sender revoked grant");
  const afterRevoke = await json(`/api/v1/invitations/${first.token}`, { headers: { cookie: recipientCookie } });
  assert(afterRevoke.response.status === 404, "revocation is immediate");

  const second = await createInvite(fileId, recipientEmail);
  const reinvited = await json<{ status: string }>(`/api/v1/invitations/${second.token}`, { headers: { cookie: recipientCookie } });
  assert(reinvited.response.ok && reinvited.body.status === "pending", "revoked recipient can be securely re-invited");
  const declined = await fetch(`${base}/api/v1/invitations/${second.token}/decline`, { method: "POST", headers: { cookie: recipientCookie } });
  assert(declined.status === 204, "recipient declined re-invitation");
  const afterDecline = await json(`/api/v1/invitations/${second.token}`, { headers: { cookie: recipientCookie } });
  assert(afterDecline.response.status === 404, "declined invitation grants no access");
  const expired = await createInvite(fileId, recipientEmail, new Date(Date.now() - 1_000).toISOString());
  const afterExpiry = await json(`/api/v1/invitations/${expired.token}`, { headers: { cookie: recipientCookie } });
  assert(afterExpiry.response.status === 404, "expired invitation grants no access");
  console.log("✓ GUEST SMOKE PASSED — pending → identity denial → accept/download → revoke → re-invite/decline → expiry");
}

main().catch((error) => { console.error(error); process.exit(1); });
