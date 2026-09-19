ALTER TYPE "release_trigger_enum" ADD VALUE 'rollback';--> statement-breakpoint
ALTER TABLE "release" ADD COLUMN "env" jsonb;--> statement-breakpoint
ALTER TABLE "release" ADD COLUMN "container_port" integer;--> statement-breakpoint
ALTER TABLE "release" ADD COLUMN "min_replicas" integer;--> statement-breakpoint
ALTER TABLE "release" ADD COLUMN "max_replicas" integer;--> statement-breakpoint
ALTER TABLE "release" ADD COLUMN "image_pull_credentials_enc" text;--> statement-breakpoint
ALTER TABLE "release" ADD COLUMN "source_release_uuid" uuid;--> statement-breakpoint
--> Backfill hand-authored: drizzle-kit adds NOT NULL columns with no default, which fails on
--> existing rows. Every existing release was rendered from its app's current row, so copy it.
UPDATE "release" SET
  "env" = "app"."env",
  "container_port" = "app"."container_port",
  "min_replicas" = "app"."min_replicas",
  "max_replicas" = "app"."max_replicas",
  "image_pull_credentials_enc" = "app"."image_pull_credentials_enc"
FROM "app" WHERE "release"."app_uuid" = "app"."uuid";--> statement-breakpoint
ALTER TABLE "release" ALTER COLUMN "env" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "release" ALTER COLUMN "container_port" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "release" ALTER COLUMN "min_replicas" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "release" ALTER COLUMN "max_replicas" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "release" ADD CONSTRAINT "release_source_release_uuid_release_uuid_fkey" FOREIGN KEY ("source_release_uuid") REFERENCES "release"("uuid") ON DELETE SET NULL;
