import { asc, eq } from 'drizzle-orm'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import { databaseTable } from '#src/app/database-management/entities/database.table.js'
import { databaseAttachmentTable } from '#src/app/database-management/entities/database-attachment.table.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

export type AttachedDatabase = Awaited<ReturnType<typeof selectAttachmentsForApp>>[number]

// Ordered by uuid so the rendered env list is stable across deploys of unchanged config.
export function selectAttachmentsForApp(tx: Executor, appUuid: AppUuid) {
  return tx
    .select({
      alias: databaseAttachmentTable.alias,
      databaseSlug: databaseTable.slug,
      engine: databaseTable.engine,
      version: databaseTable.version,
    })
    .from(databaseAttachmentTable)
    .innerJoin(databaseTable, eq(databaseAttachmentTable.databaseUuid, databaseTable.uuid))
    .where(eq(databaseAttachmentTable.appUuid, appUuid))
    .orderBy(asc(databaseAttachmentTable.uuid))
}
