import { sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { getMigrationsToRun } from 'drizzle-orm/migrator.utils'
import { upgradeIfNeeded } from 'drizzle-orm/up-migrations/pg'
import { AdvisoryLock } from '#src/modules/database/advisory-locks.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'

const MIGRATIONS_SCHEMA = 'drizzle'
const MIGRATIONS_TABLE = '__drizzle_migrations'

type JournalRow = Record<string, unknown> & {
  id: number
  hash: string
  created_at: string
  name: string | null
}

// One transaction per migration, unlike drizzle's single batch transaction: Postgres refuses
// to use an enum value added earlier in the same transaction (55P04), so a batched
// `ADD VALUE` + `SET DEFAULT` breaks every existing install. `MigrationConfig` has no
// transaction option, so the loop is rebuilt here on drizzle's public helpers.
export async function migrate(db: Database, migrationsFolder: string): Promise<string[]> {
  const migrations = readMigrationFiles({ migrationsFolder })

  await db.execute(sql`create schema if not exists ${sql.identifier(MIGRATIONS_SCHEMA)}`)
  const { newDb } = await upgradeIfNeeded(MIGRATIONS_SCHEMA, MIGRATIONS_TABLE, db, migrations)
  if (newDb) {
    await db.execute(sql`
      create table if not exists ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)} (
        id serial primary key,
        hash text not null,
        created_at bigint,
        name text,
        applied_at timestamp with time zone default now()
      )
    `)
  }

  const journal = await db.execute<JournalRow>(
    sql`select id, hash, created_at, name from ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)}`,
  )
  const pending = getMigrationsToRun({ localMigrations: migrations, dbMigrations: journal.rows })

  const applied: string[] = []
  for (const migration of pending) {
    await db.transaction(async (tx) => {
      // Drizzle's migrator takes no lock at all, and every replica migrates on boot.
      await tx.execute(sql`select pg_advisory_xact_lock(${AdvisoryLock.Migration})`)

      // Keyed on name, matching getMigrationsToRun — selecting pending work by one identity
      // and claiming it by another would let the two disagree.
      const claimed = await tx.execute(
        sql`select name from ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)} where name = ${migration.name}`,
      )
      if (claimed.rows.length > 0) {
        return
      }

      for (const statement of migration.sql) {
        await tx.execute(sql.raw(statement))
      }
      await tx.execute(
        sql`insert into ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)} ("hash", "created_at", "name") values (${migration.hash}, ${migration.folderMillis}, ${migration.name ?? null})`,
      )
      applied.push(migration.name)
    })
  }

  return applied
}
