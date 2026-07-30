import { drizzle } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import { relations } from '#src/sql/relations.js'

export const createDatabase = (pool: Pool) => drizzle({ client: pool, relations })

export type Database = ReturnType<typeof createDatabase>

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/** Accepts either the pooled db or an open transaction, so repositories can join a caller's unit of work. */
export type Executor = Database | Transaction

/** drizzle-kit migration output; consumed by the runtime migrator (cwd-relative to the api root). */
export const MIGRATIONS_FOLDER = 'src/sql/drizzle'
