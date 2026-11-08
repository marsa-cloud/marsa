ALTER TABLE "app" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "deletion_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "deletion_error" text;