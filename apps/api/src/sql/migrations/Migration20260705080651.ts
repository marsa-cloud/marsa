import { Migration } from '@mikro-orm/migrations'

export class Migration20260705080651 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter type "release_status_enum" rename to "deploy_status_enum";`)
    this.addSql(`alter table "release" rename column "status" to "deploy_status";`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "release" rename column "deploy_status" to "status";`)
    this.addSql(`alter type "deploy_status_enum" rename to "release_status_enum";`)
  }
}
