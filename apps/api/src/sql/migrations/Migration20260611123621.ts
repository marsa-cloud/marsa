import { Migration } from '@mikro-orm/migrations'

export class Migration20260611123621 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "github_installation" ("uuid" uuid not null, "installation_id" varchar(255) not null, "account_login" varchar(255) null, "app_uuid" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "github_installation_pkey" primary key ("uuid"));`,
    )
    this.addSql(
      `alter table "github_installation" add constraint "github_installation_installation_id_unique" unique ("installation_id");`,
    )

    this.addSql(
      `alter table "github_installation" add constraint "github_installation_app_uuid_foreign" foreign key ("app_uuid") references "github_app" ("uuid") on update cascade;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "github_installation" cascade;`)
  }
}
