CREATE TYPE "public"."actor_type" AS ENUM('user', 'service_account', 'api_client', 'agent', 'system', 'external_user', 'anonymous');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('requested', 'awaiting_approval', 'approved', 'running', 'paused', 'completed', 'partially_completed', 'failed', 'cancelled', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."assurance_level" AS ENUM('aal1', 'aal2', 'aal3');--> statement-breakpoint
CREATE TYPE "public"."audit_outcome" AS ENUM('success', 'failure', 'denied', 'error');--> statement-breakpoint
CREATE TYPE "public"."drive_type" AS ENUM('personal', 'team', 'shared', 'workspace', 'data_room');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('initiated', 'uploading', 'uploaded', 'quarantined', 'scanning', 'rejected', 'processing', 'available', 'restricted', 'archived', 'pending_deletion', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'active', 'completed', 'failed', 'delayed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."link_access" AS ENUM('view_only', 'download', 'upload_only', 'comment', 'edit');--> statement-breakpoint
CREATE TYPE "public"."malware_status" AS ENUM('pending', 'scanning', 'clean', 'infected', 'suspicious', 'unsupported', 'error');--> statement-breakpoint
CREATE TYPE "public"."permission_level" AS ENUM('viewer', 'downloader', 'commenter', 'editor', 'manager', 'owner');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."retention_action" AS ENUM('retain', 'review', 'archive', 'delete');--> statement-breakpoint
CREATE TYPE "public"."share_type" AS ENUM('user', 'group', 'team', 'workspace', 'external_email', 'link', 'file_request');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mfa_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"secret_ref" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"device_type" text,
	"backed_up" boolean DEFAULT false NOT NULL,
	"transports" text,
	"name" text,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_organisation_id" uuid,
	"assurance_level" "assurance_level" DEFAULT 'aal1' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trusted_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_fingerprint" text NOT NULL,
	"name" text,
	"last_seen_ip" text,
	"last_seen_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source" text DEFAULT 'local' NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisation_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verification_token" text,
	"verified_at" timestamp with time zone,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisation_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"employment_type" text,
	"invited_by" uuid,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"data_residency" text,
	"plan_tier" text,
	"branding_config" jsonb,
	"settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_team_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"requested_level" "permission_level" NOT NULL,
	"justification" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone,
	"reviewer_id" uuid,
	"completed_at" timestamp with time zone,
	"findings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"principal_type" text NOT NULL,
	"principal_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid,
	"granted_by" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"is_test_mode" boolean DEFAULT false NOT NULL,
	"domain_routing" text,
	"attribute_mapping" jsonb,
	"group_mapping" jsonb,
	"role_mapping" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oidc_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_provider_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_ref" text NOT NULL,
	"authorization_endpoint" text,
	"token_endpoint" text,
	"userinfo_endpoint" text,
	"jwks_uri" text,
	"scopes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saml_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_provider_id" uuid NOT NULL,
	"entity_id" text NOT NULL,
	"sso_url" text NOT NULL,
	"slo_url" text,
	"x509_cert_ref" text NOT NULL,
	"sign_requests" boolean DEFAULT false NOT NULL,
	"metadata_xml" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scim_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"base_url" text,
	"deprovision_policy" text DEFAULT 'suspend' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scim_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scim_configuration_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"name" text,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "drive_type" NOT NULL,
	"owner_id" uuid,
	"workspace_id" uuid,
	"quota_bytes" bigint,
	"used_bytes" bigint DEFAULT 0 NOT NULL,
	"data_residency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"drive_id" uuid NOT NULL,
	"parent_folder_id" uuid,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"depth" integer NOT NULL,
	"created_by" uuid,
	"is_template" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"role" text NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"archived_at" timestamp with time zone,
	"settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encryption_key_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"kms_driver" text NOT NULL,
	"key_ref" text NOT NULL,
	"purpose" text NOT NULL,
	"rotated_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"storage_provider_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" text NOT NULL,
	"encryption_key_id" uuid,
	"sse_mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"driver" text NOT NULL,
	"region" text NOT NULL,
	"bucket" text NOT NULL,
	"endpoint" text,
	"credentials_ref" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"locked_by" uuid NOT NULL,
	"lock_type" text NOT NULL,
	"reason" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"storage_object_id" uuid NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" text NOT NULL,
	"mime_type" text NOT NULL,
	"created_by" uuid NOT NULL,
	"comment" text,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"drive_id" uuid NOT NULL,
	"folder_id" uuid,
	"current_version_id" uuid,
	"name" text NOT NULL,
	"normalised_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"detected_content_type" text,
	"size_bytes" bigint NOT NULL,
	"owner_id" uuid NOT NULL,
	"custodian_id" uuid,
	"status" "file_status" DEFAULT 'initiated' NOT NULL,
	"malware_status" "malware_status" DEFAULT 'pending' NOT NULL,
	"processing_status" "processing_status" DEFAULT 'pending' NOT NULL,
	"ai_indexing_status" text DEFAULT 'disabled' NOT NULL,
	"preview_status" text DEFAULT 'pending' NOT NULL,
	"source_system" text,
	"provenance" jsonb,
	"data_residency" text NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"row_version" text DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "multipart_upload_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_session_id" uuid NOT NULL,
	"part_number" integer NOT NULL,
	"etag" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"drive_id" uuid NOT NULL,
	"folder_id" uuid,
	"file_id" uuid,
	"initiated_by" uuid NOT NULL,
	"declared_name" text NOT NULL,
	"declared_size" bigint NOT NULL,
	"declared_mime" text NOT NULL,
	"storage_object_id" uuid,
	"storage_upload_id" text,
	"status" text NOT NULL,
	"checksum_sha256" text,
	"part_count" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extracted_text" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"file_version_id" uuid NOT NULL,
	"source" text NOT NULL,
	"language" text,
	"char_count" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"file_version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_object_id" uuid,
	"status" "processing_status" DEFAULT 'pending' NOT NULL,
	"width" integer,
	"height" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_metadata_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"value_text" text,
	"value_number" text,
	"value_date" timestamp with time zone,
	"value_json" jsonb,
	"set_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"colour" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metadata_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schema_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"order_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metadata_schemas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"applies_to" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"colour" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"colour" text,
	"description" text,
	"rank" integer NOT NULL,
	"handling_rules" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"classification_id" uuid NOT NULL,
	"applied_by" uuid,
	"source" text NOT NULL,
	"confidence" text,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"approver_id" uuid,
	"status" text NOT NULL,
	"policy_version" text,
	"decided_at" timestamp with time zone,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"file_version_id" uuid,
	"author_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"body" text NOT NULL,
	"anchor" jsonb,
	"resolved_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"mentioned_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"file_version_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"status" text NOT NULL,
	"due_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"file_id" uuid,
	"folder_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"assignee_id" uuid,
	"created_by" uuid NOT NULL,
	"status" text NOT NULL,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_access_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"share_link_id" uuid,
	"share_id" uuid,
	"recipient_email" text,
	"ip_address" text,
	"user_agent" text,
	"country" text,
	"action" text NOT NULL,
	"file_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"share_id" uuid NOT NULL,
	"token" text NOT NULL,
	"access" "link_access" NOT NULL,
	"password_hash" text,
	"require_auth" boolean DEFAULT true NOT NULL,
	"require_mfa" boolean DEFAULT false NOT NULL,
	"allowed_domains" jsonb,
	"allowed_ip_ranges" jsonb,
	"allowed_countries" jsonb,
	"max_access_count" integer,
	"access_count" integer DEFAULT 0 NOT NULL,
	"download_enabled" boolean DEFAULT false NOT NULL,
	"watermark" boolean DEFAULT false NOT NULL,
	"one_time" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"principal_type" text NOT NULL,
	"principal_id" uuid,
	"email" text,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"file_id" uuid,
	"folder_id" uuid,
	"drive_id" uuid,
	"type" "share_type" NOT NULL,
	"permission_level" "permission_level" NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"status" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"last_access_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_request_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_request_id" uuid NOT NULL,
	"submitter_email" text,
	"submitter_name" text,
	"file_id" uuid,
	"ip_address" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"target_folder_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"token" text NOT NULL,
	"require_auth" boolean DEFAULT true NOT NULL,
	"allowed_emails" jsonb,
	"max_submissions" integer,
	"expires_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"email" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"role" text,
	"workspace_id" uuid,
	"token" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "malware_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"file_version_id" uuid NOT NULL,
	"engine" text NOT NULL,
	"status" "malware_status" NOT NULL,
	"signature" text,
	"verdict" text,
	"scanned_at" timestamp with time zone,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dlp_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"dlp_scan_id" uuid NOT NULL,
	"file_version_id" uuid NOT NULL,
	"detector_key" text NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"count" integer NOT NULL,
	"sample_redacted" text,
	"location" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dlp_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"file_version_id" uuid NOT NULL,
	"status" "processing_status" NOT NULL,
	"engine" text NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"scanned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" "job_status" NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"correlation_id" uuid,
	"payload" jsonb,
	"error" text,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disposition_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"retention_assignment_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"decision" text NOT NULL,
	"status" text NOT NULL,
	"destruction_certificate_ref" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"retention_policy_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"computed_disposition_at" timestamp with time zone,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger" text NOT NULL,
	"retain_for_days" integer NOT NULL,
	"action" "retention_action" NOT NULL,
	"requires_disposition_review" boolean DEFAULT false NOT NULL,
	"archive_storage_class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_hold_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"legal_hold_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"added_by" uuid NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"matter" text,
	"description" text,
	"custodian_note" text,
	"status" text NOT NULL,
	"created_by" uuid NOT NULL,
	"released_by" uuid,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"organisation_id" uuid NOT NULL,
	"actor_type" "actor_type",
	"actor_id" uuid,
	"actor_display" text,
	"impersonator_id" uuid,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" uuid,
	"resource_version" text,
	"outcome" "audit_outcome" NOT NULL,
	"failure_reason" text,
	"ip_address" text,
	"user_agent" text,
	"device_info" text,
	"session_id" uuid,
	"api_client_id" uuid,
	"agent_id" uuid,
	"mcp_client_id" uuid,
	"request_id" uuid,
	"correlation_id" uuid,
	"assurance_level" text,
	"before_state" jsonb,
	"after_state" jsonb,
	"metadata" jsonb,
	"prev_hash" text,
	"hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"actor_id" uuid,
	"resource_type" text,
	"resource_id" uuid,
	"ip_address" text,
	"details" jsonb,
	"status" text NOT NULL,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"file_version_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"model" text NOT NULL,
	"content_hash" text NOT NULL,
	"token_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"type" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"provider_id" uuid,
	"model" text,
	"prompt_template_version" text,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"requested_by" uuid NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"correlation_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"ai_job_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"citations" jsonb,
	"model" text,
	"retention_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"ai_enabled" boolean DEFAULT false NOT NULL,
	"allow_hosted_providers" boolean DEFAULT false NOT NULL,
	"allow_training" boolean DEFAULT false NOT NULL,
	"allowed_regions" jsonb,
	"default_provider_id" uuid,
	"exclude_classifications" jsonb,
	"prompt_retention_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"driver" text NOT NULL,
	"base_url" text,
	"api_key_ref" text,
	"region" text,
	"is_hosted" boolean NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"step_index" integer,
	"requested_by" uuid,
	"approver_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"type" text NOT NULL,
	"tool_key" text,
	"args_redacted" jsonb,
	"result_redacted" jsonb,
	"authorised" boolean,
	"provenance" jsonb,
	"tokens_used" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"initiator_type" text NOT NULL,
	"initiator_id" uuid NOT NULL,
	"goal" text NOT NULL,
	"input_resources" jsonb NOT NULL,
	"status" "agent_run_status" DEFAULT 'requested' NOT NULL,
	"max_steps" integer NOT NULL,
	"max_runtime_ms" integer,
	"max_token_budget" integer,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"tool_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"arg_schema" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"role_id" uuid,
	"allowed_workspaces" jsonb,
	"model_restrictions" jsonb,
	"rate_limit_per_hour" integer,
	"max_steps_default" integer NOT NULL,
	"max_token_budget" integer,
	"approval_threshold" text NOT NULL,
	"kill_switch" boolean DEFAULT false NOT NULL,
	"credential_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"transport" text NOT NULL,
	"principal_type" text NOT NULL,
	"principal_id" uuid,
	"allowed_tools" jsonb,
	"allowed_workspaces" jsonb,
	"rate_limit_per_minute" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"mcp_client_id" uuid NOT NULL,
	"token_hash" text,
	"ip_address" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_tool_invocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"mcp_session_id" uuid NOT NULL,
	"tool_key" text NOT NULL,
	"args_redacted" jsonb,
	"outcome" text NOT NULL,
	"authorised" boolean NOT NULL,
	"resource_type" text,
	"resource_id" uuid,
	"duration_ms" integer,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"owner_id" uuid,
	"scopes" jsonb NOT NULL,
	"allowed_ip_ranges" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"api_client_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"rotated_from" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_hash" text NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"grant_types" jsonb NOT NULL,
	"scopes" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"role_id" uuid,
	"allowed_scopes" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"credential_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"webhook_id" uuid NOT NULL,
	"webhook_event_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"response_status" integer,
	"signature" text,
	"next_retry_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"type" text NOT NULL,
	"version" text NOT NULL,
	"resource_type" text,
	"resource_id" uuid,
	"payload" jsonb NOT NULL,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"secret_ref" text NOT NULL,
	"events" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"redact_payload" boolean DEFAULT true NOT NULL,
	"last_delivery_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"category" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"resource_type" text,
	"resource_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid,
	"key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid,
	"metric" text NOT NULL,
	"limit" bigint NOT NULL,
	"used" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"value" bigint NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_factors" ADD CONSTRAINT "mfa_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_member_id_organisation_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."organisation_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_domains" ADD CONSTRAINT "organisation_domains_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_member_id_organisation_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."organisation_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_reviews" ADD CONSTRAINT "access_reviews_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_providers" ADD CONSTRAINT "identity_providers_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_configurations" ADD CONSTRAINT "oidc_configurations_identity_provider_id_identity_providers_id_fk" FOREIGN KEY ("identity_provider_id") REFERENCES "public"."identity_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saml_configurations" ADD CONSTRAINT "saml_configurations_identity_provider_id_identity_providers_id_fk" FOREIGN KEY ("identity_provider_id") REFERENCES "public"."identity_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_configurations" ADD CONSTRAINT "scim_configurations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_tokens" ADD CONSTRAINT "scim_tokens_scim_configuration_id_scim_configurations_id_fk" FOREIGN KEY ("scim_configuration_id") REFERENCES "public"."scim_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drives" ADD CONSTRAINT "drives_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drives" ADD CONSTRAINT "drives_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_drive_id_drives_id_fk" FOREIGN KEY ("drive_id") REFERENCES "public"."drives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_folder_id_folders_id_fk" FOREIGN KEY ("parent_folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encryption_key_references" ADD CONSTRAINT "encryption_key_references_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_storage_provider_id_storage_providers_id_fk" FOREIGN KEY ("storage_provider_id") REFERENCES "public"."storage_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_encryption_key_id_encryption_key_references_id_fk" FOREIGN KEY ("encryption_key_id") REFERENCES "public"."encryption_key_references"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_providers" ADD CONSTRAINT "storage_providers_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_locks" ADD CONSTRAINT "file_locks_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_locks" ADD CONSTRAINT "file_locks_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_drive_id_drives_id_fk" FOREIGN KEY ("drive_id") REFERENCES "public"."drives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multipart_upload_parts" ADD CONSTRAINT "multipart_upload_parts_upload_session_id_upload_sessions_id_fk" FOREIGN KEY ("upload_session_id") REFERENCES "public"."upload_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_text" ADD CONSTRAINT "extracted_text_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_text" ADD CONSTRAINT "extracted_text_file_version_id_file_versions_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "public"."file_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "previews" ADD CONSTRAINT "previews_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "previews" ADD CONSTRAINT "previews_file_version_id_file_versions_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "public"."file_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_metadata_values" ADD CONSTRAINT "file_metadata_values_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_metadata_values" ADD CONSTRAINT "file_metadata_values_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_metadata_values" ADD CONSTRAINT "file_metadata_values_field_id_metadata_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."metadata_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_tags" ADD CONSTRAINT "file_tags_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_tags" ADD CONSTRAINT "file_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_fields" ADD CONSTRAINT "metadata_fields_schema_id_metadata_schemas_id_fk" FOREIGN KEY ("schema_id") REFERENCES "public"."metadata_schemas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_schemas" ADD CONSTRAINT "metadata_schemas_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classifications" ADD CONSTRAINT "classifications_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_classifications" ADD CONSTRAINT "file_classifications_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_classifications" ADD CONSTRAINT "file_classifications_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_classifications" ADD CONSTRAINT "file_classifications_classification_id_classifications_id_fk" FOREIGN KEY ("classification_id") REFERENCES "public"."classifications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_access_events" ADD CONSTRAINT "share_access_events_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_recipients" ADD CONSTRAINT "share_recipients_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_users" ADD CONSTRAINT "external_users_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_request_submissions" ADD CONSTRAINT "file_request_submissions_file_request_id_file_requests_id_fk" FOREIGN KEY ("file_request_id") REFERENCES "public"."file_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_requests" ADD CONSTRAINT "file_requests_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_requests" ADD CONSTRAINT "file_requests_target_folder_id_folders_id_fk" FOREIGN KEY ("target_folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "malware_scans" ADD CONSTRAINT "malware_scans_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "malware_scans" ADD CONSTRAINT "malware_scans_file_version_id_file_versions_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "public"."file_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dlp_findings" ADD CONSTRAINT "dlp_findings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dlp_findings" ADD CONSTRAINT "dlp_findings_dlp_scan_id_dlp_scans_id_fk" FOREIGN KEY ("dlp_scan_id") REFERENCES "public"."dlp_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dlp_scans" ADD CONSTRAINT "dlp_scans_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dlp_scans" ADD CONSTRAINT "dlp_scans_file_version_id_file_versions_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "public"."file_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposition_reviews" ADD CONSTRAINT "disposition_reviews_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposition_reviews" ADD CONSTRAINT "disposition_reviews_retention_assignment_id_retention_assignments_id_fk" FOREIGN KEY ("retention_assignment_id") REFERENCES "public"."retention_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_assignments" ADD CONSTRAINT "retention_assignments_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_assignments" ADD CONSTRAINT "retention_assignments_retention_policy_id_retention_policies_id_fk" FOREIGN KEY ("retention_policy_id") REFERENCES "public"."retention_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_hold_resources" ADD CONSTRAINT "legal_hold_resources_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_hold_resources" ADD CONSTRAINT "legal_hold_resources_legal_hold_id_legal_holds_id_fk" FOREIGN KEY ("legal_hold_id") REFERENCES "public"."legal_holds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_file_version_id_file_versions_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "public"."file_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_outputs" ADD CONSTRAINT "ai_outputs_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_outputs" ADD CONSTRAINT "ai_outputs_ai_job_id_ai_jobs_id_fk" FOREIGN KEY ("ai_job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_policies" ADD CONSTRAINT "ai_policies_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tools" ADD CONSTRAINT "agent_tools_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tools" ADD CONSTRAINT "agent_tools_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_clients" ADD CONSTRAINT "mcp_clients_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_sessions" ADD CONSTRAINT "mcp_sessions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_sessions" ADD CONSTRAINT "mcp_sessions_mcp_client_id_mcp_clients_id_fk" FOREIGN KEY ("mcp_client_id") REFERENCES "public"."mcp_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tool_invocations" ADD CONSTRAINT "mcp_tool_invocations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tool_invocations" ADD CONSTRAINT "mcp_tool_invocations_mcp_session_id_mcp_sessions_id_fk" FOREIGN KEY ("mcp_session_id") REFERENCES "public"."mcp_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_credentials" ADD CONSTRAINT "api_credentials_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_credentials" ADD CONSTRAINT "api_credentials_api_client_id_api_clients_id_fk" FOREIGN KEY ("api_client_id") REFERENCES "public"."api_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_event_id_webhook_events_id_fk" FOREIGN KEY ("webhook_event_id") REFERENCES "public"."webhook_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotas" ADD CONSTRAINT "quotas_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_id_account_id_index" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_index" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mfa_factors_user_id_index" ON "mfa_factors" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "passkeys_credential_id_index" ON "passkeys" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "passkeys_user_id_index" ON "passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recovery_codes_user_id_index" ON "recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_index" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trusted_devices_user_id_index" ON "trusted_devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_index" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_group_id_member_id_index" ON "group_members" USING btree ("group_id","member_id");--> statement-breakpoint
CREATE INDEX "group_members_member_id_index" ON "group_members" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_organisation_id_name_index" ON "groups" USING btree ("organisation_id","name");--> statement-breakpoint
CREATE INDEX "groups_organisation_id_index" ON "groups" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_domains_domain_index" ON "organisation_domains" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "organisation_domains_organisation_id_index" ON "organisation_domains" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_members_organisation_id_user_id_index" ON "organisation_members" USING btree ("organisation_id","user_id");--> statement-breakpoint
CREATE INDEX "organisation_members_organisation_id_index" ON "organisation_members" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organisations_slug_index" ON "organisations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_team_id_member_id_index" ON "team_members" USING btree ("team_id","member_id");--> statement-breakpoint
CREATE INDEX "team_members_member_id_index" ON "team_members" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_organisation_id_name_index" ON "teams" USING btree ("organisation_id","name");--> statement-breakpoint
CREATE INDEX "teams_organisation_id_index" ON "teams" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "access_requests_organisation_id_index" ON "access_requests" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "access_requests_organisation_id_status_index" ON "access_requests" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "access_reviews_organisation_id_index" ON "access_reviews" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_key_index" ON "permissions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "role_assignments_organisation_id_principal_id_index" ON "role_assignments" USING btree ("organisation_id","principal_id");--> statement-breakpoint
CREATE INDEX "role_assignments_organisation_id_index" ON "role_assignments" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "role_assignments_role_id_index" ON "role_assignments" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_organisation_id_key_index" ON "roles" USING btree ("organisation_id","key");--> statement-breakpoint
CREATE INDEX "roles_organisation_id_index" ON "roles" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "identity_providers_organisation_id_index" ON "identity_providers" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_configurations_identity_provider_id_index" ON "oidc_configurations" USING btree ("identity_provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saml_configurations_identity_provider_id_index" ON "saml_configurations" USING btree ("identity_provider_id");--> statement-breakpoint
CREATE INDEX "scim_configurations_organisation_id_index" ON "scim_configurations" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "scim_tokens_scim_configuration_id_index" ON "scim_tokens" USING btree ("scim_configuration_id");--> statement-breakpoint
CREATE INDEX "drives_organisation_id_index" ON "drives" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "drives_organisation_id_type_index" ON "drives" USING btree ("organisation_id","type");--> statement-breakpoint
CREATE INDEX "folders_organisation_id_index" ON "folders" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "folders_drive_id_parent_folder_id_index" ON "folders" USING btree ("drive_id","parent_folder_id");--> statement-breakpoint
CREATE INDEX "folders_path_index" ON "folders" USING btree ("path");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_workspace_id_member_id_index" ON "workspace_members" USING btree ("workspace_id","member_id");--> statement-breakpoint
CREATE INDEX "workspaces_organisation_id_index" ON "workspaces" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_organisation_id_slug_index" ON "workspaces" USING btree ("organisation_id","slug");--> statement-breakpoint
CREATE INDEX "encryption_key_references_organisation_id_index" ON "encryption_key_references" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "storage_objects_organisation_id_index" ON "storage_objects" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_objects_storage_provider_id_object_key_index" ON "storage_objects" USING btree ("storage_provider_id","object_key");--> statement-breakpoint
CREATE INDEX "storage_providers_organisation_id_index" ON "storage_providers" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "file_locks_file_id_index" ON "file_locks" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "file_versions_organisation_id_index" ON "file_versions" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "file_versions_file_id_index" ON "file_versions" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_versions_file_id_version_number_index" ON "file_versions" USING btree ("file_id","version_number");--> statement-breakpoint
CREATE INDEX "files_organisation_id_index" ON "files" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "files_organisation_id_drive_id_folder_id_index" ON "files" USING btree ("organisation_id","drive_id","folder_id");--> statement-breakpoint
CREATE INDEX "files_organisation_id_status_index" ON "files" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "files_active_location_idx" ON "files" USING btree ("organisation_id","drive_id","folder_id") WHERE "files"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "multipart_upload_parts_upload_session_id_part_number_index" ON "multipart_upload_parts" USING btree ("upload_session_id","part_number");--> statement-breakpoint
CREATE INDEX "upload_sessions_organisation_id_index" ON "upload_sessions" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "upload_sessions_organisation_id_status_index" ON "upload_sessions" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "extracted_text_organisation_id_index" ON "extracted_text" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "extracted_text_file_version_id_index" ON "extracted_text" USING btree ("file_version_id");--> statement-breakpoint
CREATE INDEX "previews_organisation_id_index" ON "previews" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "previews_file_version_id_index" ON "previews" USING btree ("file_version_id");--> statement-breakpoint
CREATE INDEX "file_metadata_values_organisation_id_index" ON "file_metadata_values" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_metadata_values_file_id_field_id_index" ON "file_metadata_values" USING btree ("file_id","field_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_tags_file_id_tag_id_index" ON "file_tags" USING btree ("file_id","tag_id");--> statement-breakpoint
CREATE INDEX "labels_organisation_id_index" ON "labels" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "labels_organisation_id_key_value_index" ON "labels" USING btree ("organisation_id","key","value");--> statement-breakpoint
CREATE INDEX "metadata_fields_schema_id_index" ON "metadata_fields" USING btree ("schema_id");--> statement-breakpoint
CREATE UNIQUE INDEX "metadata_fields_schema_id_key_index" ON "metadata_fields" USING btree ("schema_id","key");--> statement-breakpoint
CREATE INDEX "metadata_schemas_organisation_id_index" ON "metadata_schemas" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "metadata_schemas_organisation_id_name_index" ON "metadata_schemas" USING btree ("organisation_id","name");--> statement-breakpoint
CREATE INDEX "tags_organisation_id_index" ON "tags" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_organisation_id_name_index" ON "tags" USING btree ("organisation_id","name");--> statement-breakpoint
CREATE INDEX "classifications_organisation_id_index" ON "classifications" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classifications_organisation_id_name_index" ON "classifications" USING btree ("organisation_id","name");--> statement-breakpoint
CREATE INDEX "file_classifications_organisation_id_index" ON "file_classifications" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_classifications_file_id_index" ON "file_classifications" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "approval_requests_organisation_id_index" ON "approval_requests" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "approval_requests_organisation_id_status_index" ON "approval_requests" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "comments_organisation_id_index" ON "comments" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "comments_file_id_index" ON "comments" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "mentions_mentioned_user_id_index" ON "mentions" USING btree ("mentioned_user_id");--> statement-breakpoint
CREATE INDEX "review_requests_organisation_id_index" ON "review_requests" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "tasks_organisation_id_index" ON "tasks" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "tasks_organisation_id_assignee_id_index" ON "tasks" USING btree ("organisation_id","assignee_id");--> statement-breakpoint
CREATE INDEX "share_access_events_organisation_id_created_at_index" ON "share_access_events" USING btree ("organisation_id","created_at");--> statement-breakpoint
CREATE INDEX "share_links_organisation_id_index" ON "share_links" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_token_index" ON "share_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "share_recipients_share_id_index" ON "share_recipients" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "shares_organisation_id_index" ON "shares" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "shares_file_id_index" ON "shares" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "external_users_organisation_id_index" ON "external_users" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_users_organisation_id_email_index" ON "external_users" USING btree ("organisation_id","email");--> statement-breakpoint
CREATE INDEX "file_request_submissions_file_request_id_index" ON "file_request_submissions" USING btree ("file_request_id");--> statement-breakpoint
CREATE INDEX "file_requests_organisation_id_index" ON "file_requests" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_requests_token_index" ON "file_requests" USING btree ("token");--> statement-breakpoint
CREATE INDEX "invitations_organisation_id_index" ON "invitations" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_index" ON "invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "malware_scans_organisation_id_index" ON "malware_scans" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "malware_scans_organisation_id_status_index" ON "malware_scans" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "dlp_findings_organisation_id_index" ON "dlp_findings" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "dlp_findings_organisation_id_severity_index" ON "dlp_findings" USING btree ("organisation_id","severity");--> statement-breakpoint
CREATE INDEX "dlp_scans_organisation_id_index" ON "dlp_scans" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "dlp_scans_file_version_id_index" ON "dlp_scans" USING btree ("file_version_id");--> statement-breakpoint
CREATE INDEX "processing_jobs_organisation_id_index" ON "processing_jobs" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "processing_jobs_organisation_id_status_type_index" ON "processing_jobs" USING btree ("organisation_id","status","type");--> statement-breakpoint
CREATE INDEX "disposition_reviews_organisation_id_index" ON "disposition_reviews" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "retention_assignments_organisation_id_index" ON "retention_assignments" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "retention_assignments_organisation_id_state_index" ON "retention_assignments" USING btree ("organisation_id","state");--> statement-breakpoint
CREATE INDEX "retention_assignments_computed_disposition_at_index" ON "retention_assignments" USING btree ("computed_disposition_at");--> statement-breakpoint
CREATE INDEX "retention_policies_organisation_id_index" ON "retention_policies" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retention_policies_organisation_id_name_index" ON "retention_policies" USING btree ("organisation_id","name");--> statement-breakpoint
CREATE INDEX "legal_hold_resources_organisation_id_index" ON "legal_hold_resources" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_hold_resources_legal_hold_id_resource_type_resource_id_index" ON "legal_hold_resources" USING btree ("legal_hold_id","resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "legal_hold_resources_resource_type_resource_id_index" ON "legal_hold_resources" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "legal_holds_organisation_id_index" ON "legal_holds" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "legal_holds_organisation_id_status_index" ON "legal_holds" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "audit_events_organisation_id_seq_index" ON "audit_events" USING btree ("organisation_id","seq");--> statement-breakpoint
CREATE INDEX "audit_events_organisation_id_created_at_index" ON "audit_events" USING btree ("organisation_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_organisation_id_action_index" ON "audit_events" USING btree ("organisation_id","action");--> statement-breakpoint
CREATE INDEX "audit_events_correlation_id_index" ON "audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "audit_events_resource_type_resource_id_index" ON "audit_events" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "security_events_organisation_id_index" ON "security_events" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "security_events_organisation_id_type_status_index" ON "security_events" USING btree ("organisation_id","type","status");--> statement-breakpoint
CREATE INDEX "embeddings_organisation_id_index" ON "embeddings" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "embeddings_file_version_id_index" ON "embeddings" USING btree ("file_version_id");--> statement-breakpoint
CREATE INDEX "ai_jobs_organisation_id_index" ON "ai_jobs" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "ai_jobs_organisation_id_status_index" ON "ai_jobs" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "ai_outputs_organisation_id_index" ON "ai_outputs" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "ai_policies_organisation_id_index" ON "ai_policies" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "ai_providers_organisation_id_index" ON "ai_providers" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "agent_approvals_organisation_id_index" ON "agent_approvals" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "agent_run_steps_organisation_id_index" ON "agent_run_steps" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_steps_agent_run_id_step_index_index" ON "agent_run_steps" USING btree ("agent_run_id","step_index");--> statement-breakpoint
CREATE INDEX "agent_runs_organisation_id_index" ON "agent_runs" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "agent_runs_organisation_id_status_index" ON "agent_runs" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "agent_runs_correlation_id_index" ON "agent_runs" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "agent_tools_organisation_id_index" ON "agent_tools" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tools_agent_id_tool_key_index" ON "agent_tools" USING btree ("agent_id","tool_key");--> statement-breakpoint
CREATE INDEX "agents_organisation_id_index" ON "agents" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "mcp_clients_organisation_id_index" ON "mcp_clients" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "mcp_sessions_mcp_client_id_index" ON "mcp_sessions" USING btree ("mcp_client_id");--> statement-breakpoint
CREATE INDEX "mcp_tool_invocations_organisation_id_index" ON "mcp_tool_invocations" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "mcp_tool_invocations_organisation_id_tool_key_index" ON "mcp_tool_invocations" USING btree ("organisation_id","tool_key");--> statement-breakpoint
CREATE INDEX "api_clients_organisation_id_index" ON "api_clients" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "api_credentials_api_client_id_index" ON "api_credentials" USING btree ("api_client_id");--> statement-breakpoint
CREATE INDEX "oauth_clients_organisation_id_index" ON "oauth_clients" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_clients_client_id_index" ON "oauth_clients" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "service_accounts_organisation_id_index" ON "service_accounts" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_webhook_id_status_index" ON "webhook_deliveries" USING btree ("webhook_id","status");--> statement-breakpoint
CREATE INDEX "webhook_events_organisation_id_type_created_at_index" ON "webhook_events" USING btree ("organisation_id","type","created_at");--> statement-breakpoint
CREATE INDEX "webhooks_organisation_id_index" ON "webhooks" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "notification_preferences_organisation_id_index" ON "notification_preferences" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_user_id_channel_category_index" ON "notification_preferences" USING btree ("user_id","channel","category");--> statement-breakpoint
CREATE INDEX "notifications_organisation_id_user_id_read_at_index" ON "notifications" USING btree ("organisation_id","user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flags_organisation_id_key_index" ON "feature_flags" USING btree ("organisation_id","key");--> statement-breakpoint
CREATE INDEX "quotas_organisation_id_index" ON "quotas" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotas_organisation_id_scope_type_scope_id_metric_index" ON "quotas" USING btree ("organisation_id","scope_type","scope_id","metric");--> statement-breakpoint
CREATE INDEX "usage_records_organisation_id_metric_period_start_index" ON "usage_records" USING btree ("organisation_id","metric","period_start");