import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import { relations } from '#src/sql/relations.js'

export const createDatabase = (pool: Pool) => drizzle({ client: pool, relations })

export type Database = ReturnType<typeof createDatabase>

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/** Accepts either the pooled db or an open transaction, so repositories can join a caller's unit of work. */
export type Executor = Database | Transaction

/**
 * drizzle-kit migration output, copied into `dist` by the nest-cli `assets` glob.
 * Resolved from this module's own URL, not cwd — the container runs the compiled
 * entrypoints from an image that ships only `dist`.
 */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../sql/drizzle', import.meta.url))
