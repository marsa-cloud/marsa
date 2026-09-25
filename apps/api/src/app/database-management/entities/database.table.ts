import { sql } from 'drizzle-orm'
import { integer, jsonb, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'
import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
import type { DatabaseUuid } from '#src/app/database-management/entities/database.uuid.js'
import { DATABASE_SLUG_MAX_LENGTH } from '#src/app/database-management/entities/database-config.constants.js'
import { databaseEngineEnum } from '#src/app/database-management/enums/database-engine.enum.js'
import { environmentTable } from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { timestamps } from '#src/sql/timestamps.js'

export const databaseTable = pgTable('database', {
  uuid: uuid()
    .$type<DatabaseUuid>()
    .primaryKey()
    .default(sql`uuidv7()`),
  environmentUuid: uuid('environment_uuid')
    .$type<EnvironmentUuid>()
    .notNull()
    .references(() => environmentTable.uuid, { onDelete: 'restrict', onUpdate: 'cascade' }),
  // Unique across environments: the routes key on the slug alone (#241).
  slug: varchar({ length: DATABASE_SLUG_MAX_LENGTH }).unique().notNull(),
  engine: databaseEngineEnum().notNull(),
  version: varchar({ length: 8 }).notNull(),
  image: varchar({ length: 255 }).notNull(),
  credentialsEnc: text('credentials_enc').notNull(),
  storageGib: integer('storage_gib').notNull(),
  nodePin: jsonb('node_pin').$type<NodePin>(),
  ...timestamps,
})

// `Database` is the Drizzle client type, so the row is `DatabaseRow`.
export type DatabaseRow = typeof databaseTable.$inferSelect
export type NewDatabaseRow = typeof databaseTable.$inferInsert
