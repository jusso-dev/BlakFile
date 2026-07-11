/**
 * Named policy functions (spec §5). Thin, readable wrappers over `authorize` so
 * call sites read as intent ("canDownloadFile") while all logic stays in the
 * engine. Every sensitive operation calls one of these — never an ad-hoc check.
 */
import { authorize } from "./engine";
import type { Action, Decision, Principal, RequestContext, ResourceRef } from "./types";

function make(action: Action) {
  return (p: Principal, r: ResourceRef, ctx: RequestContext): Decision =>
    authorize(p, action, r, ctx);
}

export const canReadFile = make("file.read");
export const canPreviewFile = make("file.preview");
export const canDownloadFile = make("file.download");
export const canUploadFile = make("file.upload");
export const canShareFile = make("file.share");
export const canCreatePublicLink = make("file.share.public");
export const canInviteExternalUser = make("file.share.external");
export const canDeleteFile = make("file.delete");
export const canRestoreFile = make("file.restore");
export const canPermanentlyDeleteFile = make("file.permanent_delete");
export const canModifyClassification = make("file.classify");
export const canApplyLegalHold = make("file.legal_hold");
export const canUseAIWithFile = make("file.ai");
export const canRunAgentAction = make("agent.run");
export const canCreateApiCredential = make("apiCredential.create");
export const canAccessAuditLogs = make("audit.read");
export const canExportData = make("data.export");
