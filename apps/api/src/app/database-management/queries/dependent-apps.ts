import { asc, eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { DatabaseUuid } from '#src/app/database-management/entities/database.uuid.js'
import { databaseAttachmentTable } from '#src/app/database-management/entities/database-attachment.table.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

export async function dependentAppsOf(tx: Executor, databaseUuid: DatabaseUuid): Promise<string[]> {
  const rows = await tx
    .select({ slug: appTable.slug })
    .from(databaseAttachmentTable)
    .innerJoin(appTable, eq(databaseAttachmentTable.appUuid, appTable.uuid))
    .where(eq(databaseAttachmentTable.databaseUuid, databaseUuid))
    .orderBy(asc(appTable.slug))
  return rows.map((row) => row.slug)
}
