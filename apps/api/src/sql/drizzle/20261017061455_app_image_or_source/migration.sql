ALTER TABLE "app" ALTER COLUMN "image" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app" ADD CONSTRAINT "app_image_or_source_check" CHECK ("image" IS NOT NULL OR "source" IS NOT NULL);