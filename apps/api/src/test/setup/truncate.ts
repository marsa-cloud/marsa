import { getTableName, is, sql } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import * as schema from '#src/sql/schema.js'

const tableNames = (Object.values(schema) as unknown[])
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => `"${getTableName(table)}"`)

/** Wipe every table between suites — CASCADE handles the FKs. */
export async function truncateAll(db: Database): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE ${tableNames.join(', ')} RESTART IDENTITY CASCADE`))
}
