import { Migration } from '@mikro-orm/migrations'

export class Migration20260607130731 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "github_app" ("id" uuid not null, "github_app_id" varchar(255) not null, "slug" varchar(255) not null, "name" varchar(255) not null, "html_url" varchar(255) not null, "owner_login" varchar(255) null, "client_id" varchar(255) not null, "client_secret_enc" text not null, "webhook_secret_enc" text not null, "private_key_pem_enc" text not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "github_app_pkey" primary key ("id"));`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "github_app" cascade;`)
  }
}
