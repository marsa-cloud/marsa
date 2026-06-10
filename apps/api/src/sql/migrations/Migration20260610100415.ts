import { Migration } from '@mikro-orm/migrations'

export class Migration20260610100415 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "github_app_manifest_state" ("id" uuid not null, "expires_at" timestamptz not null, "created_at" timestamptz not null, constraint "github_app_manifest_state_pkey" primary key ("id"));`,
    )

    this.addSql(
      `alter table "github_app" add constraint "github_app_github_app_id_unique" unique ("github_app_id");`,
    )
    this.addSql(`alter table "github_app" add constraint "github_app_slug_unique" unique ("slug");`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "github_app_manifest_state" cascade;`)

    this.addSql(`alter table "github_app" drop constraint "github_app_github_app_id_unique";`)
    this.addSql(`alter table "github_app" drop constraint "github_app_slug_unique";`)
  }
}
