ALTER TABLE "upload_sessions" ADD COLUMN "base_version_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "share_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitations_share_id_index" ON "invitations" USING btree ("share_id");--> statement-breakpoint
CREATE UNIQUE INDEX "malware_scans_file_version_id_index" ON "malware_scans" USING btree ("file_version_id");