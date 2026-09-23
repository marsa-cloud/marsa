CREATE TYPE "build_status_enum" AS ENUM('running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "build_trigger_enum" AS ENUM('push', 'create', 'manual');--> statement-breakpoint
CREATE TABLE "build" (
	"uuid" uuid PRIMARY KEY DEFAULT uuidv7(),
	"app_uuid" uuid NOT NULL,
	"commit_sha" varchar(40) NOT NULL,
	"branch" varchar(255) NOT NULL,
	"status" "build_status_enum" DEFAULT 'running'::"build_status_enum" NOT NULL,
	"trigger" "build_trigger_enum" NOT NULL,
	"image_ref" varchar(255),
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "source" jsonb;--> statement-breakpoint
ALTER TABLE "release" ADD COLUMN "build_uuid" uuid;--> statement-breakpoint
CREATE INDEX "app_source_repo_branch_idx" ON "app" (("source"->>'repo'),("source"->>'branch'));--> statement-breakpoint
CREATE INDEX "build_app_uuid_idx" ON "build" ("app_uuid","uuid" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "build_running_idx" ON "build" ("created_at") WHERE "status" = 'running';--> statement-breakpoint
ALTER TABLE "build" ADD CONSTRAINT "build_app_uuid_app_uuid_fkey" FOREIGN KEY ("app_uuid") REFERENCES "app"("uuid") ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "release" ADD CONSTRAINT "release_build_uuid_build_uuid_fkey" FOREIGN KEY ("build_uuid") REFERENCES "build"("uuid") ON DELETE SET NULL;