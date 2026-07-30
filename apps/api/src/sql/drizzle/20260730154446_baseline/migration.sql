CREATE TYPE "deploy_status_enum" AS ENUM('pending', 'in_progress', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "release_trigger_enum" AS ENUM('manual', 'webhook');--> statement-breakpoint
CREATE TYPE "user_role_enum" AS ENUM('operator', 'member');--> statement-breakpoint
CREATE TABLE "app" (
	"uuid" uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
	"slug" varchar(255) NOT NULL UNIQUE,
	"domain" jsonb NOT NULL,
	"image" varchar(255) NOT NULL,
	"container_port" integer NOT NULL,
	"replicas" integer DEFAULT 1 NOT NULL,
	"env" jsonb DEFAULT '{}' NOT NULL,
	"image_pull_credentials_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_oauth_state" (
	"uuid" uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_app" (
	"uuid" uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
	"github_app_id" varchar(255) NOT NULL UNIQUE,
	"slug" varchar(255) NOT NULL UNIQUE,
	"name" varchar(255) NOT NULL,
	"html_url" varchar(255) NOT NULL,
	"owner_login" varchar(255),
	"client_id" varchar(255) NOT NULL,
	"client_secret_enc" text NOT NULL,
	"webhook_secret_enc" text NOT NULL,
	"private_key_pem_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_installation" (
	"uuid" uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
	"installation_id" varchar(255) NOT NULL UNIQUE,
	"account_login" varchar(255),
	"app_uuid" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_app_manifest_state" (
	"uuid" uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release" (
	"uuid" uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
	"app_uuid" uuid NOT NULL,
	"image_ref" varchar(255) NOT NULL,
	"triggered_by" "release_trigger_enum" DEFAULT 'manual'::"release_trigger_enum" NOT NULL,
	"deploy_status" "deploy_status_enum" DEFAULT 'pending'::"deploy_status_enum" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"uuid" uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
	"github_user_id" varchar(255) NOT NULL UNIQUE,
	"github_login" varchar(255) NOT NULL,
	"role" "user_role_enum" DEFAULT 'member'::"user_role_enum" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_installation" ADD CONSTRAINT "github_installation_app_uuid_github_app_uuid_fkey" FOREIGN KEY ("app_uuid") REFERENCES "github_app"("uuid") ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "release" ADD CONSTRAINT "release_app_uuid_app_uuid_fkey" FOREIGN KEY ("app_uuid") REFERENCES "app"("uuid") ON UPDATE CASCADE;