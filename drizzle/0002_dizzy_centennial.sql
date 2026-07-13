CREATE TABLE "file_version_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"file_version_id" uuid NOT NULL,
	"extractor" text NOT NULL,
	"values" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "previews_file_version_id_index";--> statement-breakpoint
DROP INDEX "extracted_text_file_version_id_index";--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN "consumed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shares" ADD COLUMN "revocation_reason" text;--> statement-breakpoint
ALTER TABLE "file_version_metadata" ADD CONSTRAINT "file_version_metadata_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_version_metadata" ADD CONSTRAINT "file_version_metadata_file_version_id_file_versions_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "public"."file_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_version_metadata_organisation_id_index" ON "file_version_metadata" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_version_metadata_file_version_id_index" ON "file_version_metadata" USING btree ("file_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "previews_file_version_id_kind_index" ON "previews" USING btree ("file_version_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "extracted_text_file_version_id_index" ON "extracted_text" USING btree ("file_version_id");