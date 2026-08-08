ALTER TABLE "app" ADD COLUMN "min_replicas" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "max_replicas" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
--> Backfill hand-authored: drizzle-kit generates schema changes only, so
--> without this every existing app would silently reset to the column default
--> of 1 instead of keeping the replica count it was deployed with.
UPDATE "app" SET "min_replicas" = "replicas", "max_replicas" = "replicas";--> statement-breakpoint
ALTER TABLE "app" DROP COLUMN "replicas";
