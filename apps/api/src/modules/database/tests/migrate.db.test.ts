import { readdirSync } from 'node:fs'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { sql } from 'drizzle-orm'
import { expect } from 'expect'
import { Pool } from 'pg'
import { createDatabase, MIGRATIONS_FOLDER } from '#src/modules/database/drizzle.factory.js'
import { migrate } from '#src/modules/database/migrate.js'

const SCRATCH_DB = 'marsa_migrate_replay_test'

const migrationNames = readdirSync(MIGRATIONS_FOLDER).sort()

function adminUrl(database: string): string {
  const url = new URL(process.env.DATABASE_URL as string)
  url.pathname = `/${database}`
  return url.toString()
}

// Only the first N migrations, so an upgrade can be replayed onto an older install.
async function folderWith(count: number): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'marsa-migrations-'))
  for (const name of migrationNames.slice(0, count)) {
    await cp(join(MIGRATIONS_FOLDER, name), join(folder, name), { recursive: true })
  }
  return folder
}

describe('migrate (db)', () => {
  let adminPool: Pool
  let scratchPool: Pool
  const folders: string[] = []

  before(async () => {
    adminPool = new Pool({ connectionString: adminUrl('postgres') })
    await adminPool.query(`DROP DATABASE IF EXISTS ${SCRATCH_DB}`)
    await adminPool.query(`CREATE DATABASE ${SCRATCH_DB}`)
    scratchPool = new Pool({ connectionString: adminUrl(SCRATCH_DB) })
  })

  after(async () => {
    await scratchPool.end()
    await adminPool.query(`DROP DATABASE IF EXISTS ${SCRATCH_DB}`)
    await adminPool.end()
    await Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true })))
  })

  it('replays an enum-widening upgrade onto an already-migrated install', async () => {
    const db = createDatabase(scratchPool)

    // Committed separately, exactly as an existing install has it — the batched
    // migrator drizzle ships would fail here with 55P04 on the SET DEFAULT.
    const baselineOnly = await folderWith(1)
    folders.push(baselineOnly)
    await migrate(db, baselineOnly)

    const applied = await migrate(db, MIGRATIONS_FOLDER)

    expect(applied).toEqual(migrationNames.slice(1))

    const labels = await db.execute<Record<string, unknown> & { enumlabel: string }>(
      sql`select enumlabel from pg_enum join pg_type t on t.oid = enumtypid
          where t.typname = 'user_role_enum' order by enumsortorder`,
    )
    expect(labels.rows.map((row) => row.enumlabel)).toEqual(['operator', 'member', 'guest'])

    const columns = await db.execute<Record<string, unknown> & { column_default: string }>(
      sql`select column_default from information_schema.columns
          where table_name = 'user' and column_name = 'role'`,
    )
    expect(columns.rows[0]?.column_default).toBe(`'guest'::user_role_enum`)
  })

  it('is a no-op once every migration is recorded', async () => {
    expect(await migrate(createDatabase(scratchPool), MIGRATIONS_FOLDER)).toEqual([])
  })
})
