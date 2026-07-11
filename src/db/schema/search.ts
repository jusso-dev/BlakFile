import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  vector,
} from "drizzle-orm/pg-core";
import { pk, orgId, EMBEDDING_DIM } from "./_shared";
import { organisations } from "./organisations";
import { fileVersions } from "./files";

/**
 * Vector chunks for semantic search / Ask-Your-Files. Bound to a fileVersion so
 * new uploads never contaminate old content. Embeddings are permission-filtered
 * at query time and are NEVER returned to an unauthorised caller.
 *
 * NOTE: the HNSW/ivfflat index on `embedding` is created via a SQL migration
 * (operator classes + build params aren't expressible cleanly in Drizzle here).
 */
export const embeddings = pgTable(
  "embeddings",
  {
    id: pk(),
    organisationId: orgId().references(() => organisations.id, {
      onDelete: "cascade",
    }),
    fileVersionId: uuid("file_version_id")
      .notNull()
      .references(() => fileVersions.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    chunkText: text("chunk_text").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }).notNull(),
    model: text("model").notNull(),
    // reuse an existing embedding only if this content hash proves equivalence
    contentHash: text("content_hash").notNull(),
    tokenCount: integer("token_count"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index().on(t.organisationId),
    index().on(t.fileVersionId),
  ],
);
