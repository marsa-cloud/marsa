import { drizzle } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import { relations } from '#src/sql/relations.js'

export const createDatabase = (pool: Pool) => drizzle({ client: pool, relations })

export type Database = ReturnType<typeof createDatabase>
