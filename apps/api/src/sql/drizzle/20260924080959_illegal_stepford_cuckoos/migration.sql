CREATE TYPE "database_engine_enum" AS ENUM('postgres');--> statement-breakpoint
CREATE TABLE "database" (
	"uuid" uuid PRIMARY KEY DEFAULT uuidv7(),
	"environment_uuid" uuid NOT NULL,
	"slug" varchar(52) NOT NULL,
	"engine" "database_engine_enum" NOT NULL,
	"version" varchar(8) NOT NULL,
	"image" varchar(255) NOT NULL,
	"credentials_enc" text NOT NULL,
	"storage_gib" integer NOT NULL,
	"node_pin" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "database_environment_uuid_slug_unique" UNIQUE("environment_uuid","slug")
);
--> statement-breakpoint
ALTER TABLE "database" ADD CONSTRAINT "database_environment_uuid_environment_uuid_fkey" FOREIGN KEY ("environment_uuid") REFERENCES "environment"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;