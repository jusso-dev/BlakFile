/**
 * Schema barrel — the single entry Drizzle Kit reads (see drizzle.config.ts).
 * Re-exports every domain schema module plus shared enums/helpers.
 *
 * Tables are grouped by domain module (src/db/schema/<domain>.ts). Cross-domain
 * foreign keys use lazy thunks so import order here does not matter.
 */
export * from "./_shared";

// identity & organisation
export * from "./identity";
export * from "./organisations";
export * from "./authorisation";
export * from "./identity-providers";

// workspaces, storage, files
export * from "./workspaces";
export * from "./storage";
export * from "./files";
export * from "./uploads";
export * from "./previews";

// metadata, classification, collaboration, sharing
export * from "./metadata";
export * from "./classifications";
export * from "./collaboration";
export * from "./sharing";
export * from "./external";

// governance
export * from "./malware";
export * from "./dlp";
export * from "./processing";
export * from "./retention";
export * from "./legal-hold";
export * from "./audit";

// AI, agents, integration surfaces
export * from "./search";
export * from "./ai";
export * from "./agents";
export * from "./mcp";
export * from "./api";
export * from "./webhooks";
export * from "./notifications";
export * from "./usage";
