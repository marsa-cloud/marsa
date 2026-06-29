import { Migration } from '@mikro-orm/migrations'

export class Migration20260628162043 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create type "release_trigger_enum" as enum ('manual', 'webhook');`)
    this.addSql(
      `create type "release_status_enum" as enum ('pending', 'in_progress', 'succeeded', 'failed');`,
    )
    this.addSql(
      `create table "app" ("uuid" uuid not null, "slug" varchar(255) not null, "domain" jsonb not null, "image" varchar(255) not null, "container_port" int not null, "replicas" int not null default 1, "env" jsonb not null, "image_pull_credentials_enc" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "app_pkey" primary key ("uuid"));`,
    )
    this.addSql(`alter table "app" add constraint "app_slug_unique" unique ("slug");`)

    this.addSql(
      `create table "release" ("uuid" uuid not null, "app_uuid" uuid not null, "image_ref" varchar(255) not null, "triggered_by" "release_trigger_enum" not null default 'manual', "status" "release_status_enum" not null default 'pending', "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "release_pkey" primary key ("uuid"));`,
    )

    this.addSql(
      `alter table "release" add constraint "release_app_uuid_foreign" foreign key ("app_uuid") references "app" ("uuid") on update cascade;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "release" drop constraint "release_app_uuid_foreign";`)

    this.addSql(`drop table if exists "app" cascade;`)

    this.addSql(`drop table if exists "release" cascade;`)

    this.addSql(`drop type "release_trigger_enum";`)
    this.addSql(`drop type "release_status_enum";`)
  }
}
