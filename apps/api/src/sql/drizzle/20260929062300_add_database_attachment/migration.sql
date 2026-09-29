CREATE TABLE "database_attachment" (
	"uuid" uuid PRIMARY KEY DEFAULT uuidv7(),
	"app_uuid" uuid NOT NULL,
	"database_uuid" uuid NOT NULL,
	"alias" varchar(63),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "database_attachment_app_uuid_alias_unique" UNIQUE NULLS NOT DISTINCT("app_uuid","alias"),
	CONSTRAINT "database_attachment_app_uuid_database_uuid_unique" UNIQUE("app_uuid","database_uuid")
);
--> statement-breakpoint
ALTER TABLE "database_attachment" ADD CONSTRAINT "database_attachment_app_uuid_app_uuid_fkey" FOREIGN KEY ("app_uuid") REFERENCES "app"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "database_attachment" ADD CONSTRAINT "database_attachment_database_uuid_database_uuid_fkey" FOREIGN KEY ("database_uuid") REFERENCES "database"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;