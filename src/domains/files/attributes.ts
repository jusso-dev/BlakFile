/**
 * Builds the ResourceAttributes the policy engine evaluates for a file. This is
 * where governance state (legal hold, classification handling rules) becomes an
 * authorisation input — so a held or highly-classified file is enforced the same
 * way regardless of which interface (web/API/MCP) is asking.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  classifications,
  fileClassifications,
  legalHoldResources,
} from "@/db/schema";
import type { ResourceAttributes } from "@/domains/authorisation";
import type { DbTx } from "@/db";

interface FileRow {
  id: string;
  driveId: string;
  folderId: string | null;
  ownerId: string;
  dataResidency: string;
}

interface HandlingRules {
  downloadRestricted?: boolean;
  watermarkRequired?: boolean;
  requiresManagedDevice?: boolean;
  externalSharingAllowed?: boolean;
}

export async function buildFileAttributes(
  tx: DbTx,
  file: FileRow,
): Promise<ResourceAttributes> {
  const attrs: ResourceAttributes = {
    ownerId: file.ownerId,
    dataResidency: file.dataResidency,
  };

  // Legal hold: a hold on the file, its folder, or its drive all apply.
  const holdTargets = [file.id, file.driveId, ...(file.folderId ? [file.folderId] : [])];
  const holds = await tx
    .select({ id: legalHoldResources.id })
    .from(legalHoldResources)
    .where(
      and(
        inArray(legalHoldResources.resourceId, holdTargets),
        isNull(legalHoldResources.removedAt),
      ),
    )
    .limit(1);
  if (holds.length > 0) attrs.underLegalHold = true;

  // Classification handling rules → obligations/denies.
  const [cls] = await tx
    .select({ rank: classifications.rank, name: classifications.name, rules: classifications.handlingRules })
    .from(fileClassifications)
    .innerJoin(classifications, eq(fileClassifications.classificationId, classifications.id))
    .where(eq(fileClassifications.fileId, file.id))
    .limit(1);
  if (cls) {
    attrs.classificationRank = cls.rank;
    attrs.classificationName = cls.name;
    const rules = (cls.rules ?? {}) as HandlingRules;
    if (rules.downloadRestricted) attrs.downloadRestricted = true;
    if (rules.watermarkRequired) attrs.watermarkRequired = true;
    if (rules.requiresManagedDevice) attrs.requiresManagedDevice = true;
    if (rules.externalSharingAllowed !== undefined)
      attrs.externalSharingAllowed = rules.externalSharingAllowed;
  }

  return attrs;
}
