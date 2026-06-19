import { Migration } from '@mikro-orm/migrations'

export class Migration20260616192413 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "auth_oauth_state" ("uuid" uuid not null, "expires_at" timestamptz not null, "created_at" timestamptz not null, constraint "auth_oauth_state_pkey" primary key ("uuid"));`,
    )

    this.addSql(`create type "users_role_enum" as enum ('operator');`)
    this.addSql(
      `create table "users" ("uuid" uuid not null, "github_user_id" varchar(255) not null, "github_login" varchar(255) not null, "role" "users_role_enum" not null default 'operator', "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "users_pkey" primary key ("uuid"));`,
    )
    this.addSql(
      `alter table "users" add constraint "users_github_user_id_unique" unique ("github_user_id");`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "auth_oauth_state" cascade;`)

    this.addSql(`drop table if exists "users" cascade;`)
    this.addSql(`drop type if exists "users_role_enum";`)
  }
}
