ALTER TYPE "user_role_enum" ADD VALUE 'guest';--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT;