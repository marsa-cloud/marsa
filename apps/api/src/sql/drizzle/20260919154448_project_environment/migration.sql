CREATE TABLE "environment" (
	"uuid" uuid PRIMARY KEY DEFAULT uuidv7(),
	"project_uuid" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "environment_project_uuid_slug_unique" UNIQUE("project_uuid","slug")
);
--> statement-breakpoint
CREATE TABLE "project" (
	"uuid" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" varchar(255) NOT NULL,
	"slug" varchar(30) NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "environment_uuid" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "app" ADD CONSTRAINT "app_environment_uuid_environment_uuid_fkey" FOREIGN KEY ("environment_uuid") REFERENCES "environment"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "environment" ADD CONSTRAINT "environment_project_uuid_project_uuid_fkey" FOREIGN KEY ("project_uuid") REFERENCES "project"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;