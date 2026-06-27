import { Migration } from '@mikro-orm/migrations'

export class Migration20260627120000 extends Migration {
  // `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that adds
  // it (Postgres), and MikroORM wraps pending migrations in an all-or-nothing
  // transaction by default. Running this one non-transactionally lets the
  // ADD VALUE commit before SET DEFAULT references the new value. See AgDR-0024.
  override isTransactional(): boolean {
    return false
  }

  override async up(): Promise<void> {
    this.addSql(`alter type "user_role_enum" add value if not exists 'member';`)
    this.addSql(`alter table "user" alter column "role" set default 'member';`)
  }

  override async down(): Promise<void> {
    // Postgres cannot drop an enum value; resetting the column default is the
    // reversible part. Leaving 'member' in the type is non-destructive (AgDR-0024).
    this.addSql(`alter table "user" alter column "role" set default 'operator';`)
  }
}
