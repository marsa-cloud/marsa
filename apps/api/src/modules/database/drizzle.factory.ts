import { drizzle } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import { relations } from '#src/sql/relations.js'

export const createDatabase = (pool: Pool) => drizzle({ client: pool, relations })

export type Database = ReturnType<typeof createDatabase>

/** drizzle-kit migration output; consumed by the runtime migrator (cwd-relative to the api root). */
export const MIGRATIONS_FOLDER = 'src/sql/drizzle'
