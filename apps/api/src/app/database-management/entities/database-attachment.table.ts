import { sql } from 'drizzle-orm'
import { pgTable, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import { ALIAS_MAX_LENGTH } from '#src/app/database-management/entities/attachment-env.js'
import { databaseTable } from '#src/app/database-management/entities/database.table.js'
import type { DatabaseUuid } from '#src/app/database-management/entities/database.uuid.js'
import type { DatabaseAttachmentUuid } from '#src/app/database-management/entities/database-attachment.uuid.js'
import { timestamps } from '#src/sql/timestamps.js'

export const databaseAttachmentTable = pgTable(
  'database_attachment',
  {
    uuid: uuid()
      .$type<DatabaseAttachmentUuid>()
      .primaryKey()
      .default(sql`uuidv7()`),
    appUuid: uuid('app_uuid')
      .$type<AppUuid>()
      .notNull()
      .references(() => appTable.uuid, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // restrict is the mechanism behind "deleting an attached database is blocked".
    databaseUuid: uuid('database_uuid')
      .$type<DatabaseUuid>()
      .notNull()
      .references(() => databaseTable.uuid, { onDelete: 'restrict', onUpdate: 'cascade' }),
    alias: varchar({ length: ALIAS_MAX_LENGTH }),
    ...timestamps,
  },
  (table) => [
    // nullsNotDistinct: two unprefixed attachments both hold a null alias, and a plain unique
    // index treats those as distinct — which is exactly the case this must reject.
    unique('database_attachment_app_uuid_alias_unique')
      .on(table.appUuid, table.alias)
      .nullsNotDistinct(),
    unique('database_attachment_app_uuid_database_uuid_unique').on(
      table.appUuid,
      table.databaseUuid,
    ),
  ],
)

export type DatabaseAttachmentRow = typeof databaseAttachmentTable.$inferSelect
export type NewDatabaseAttachmentRow = typeof databaseAttachmentTable.$inferInsert
