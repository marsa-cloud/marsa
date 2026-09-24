import { and, eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { databaseTable } from '#src/app/database-management/entities/database.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

/** Apps and databases share one namespace per environment, so their names cannot collide.
 * No unique index spans two tables — callers hold the environment row lock. */
export async function isNameTakenInEnvironment(
  tx: Executor,
  environmentUuid: EnvironmentUuid,
  name: string,
): Promise<boolean> {
  const [app] = await tx
    .select({ slug: appTable.slug })
    .from(appTable)
    .where(and(eq(appTable.environmentUuid, environmentUuid), eq(appTable.slug, name)))
    .limit(1)
  if (app) {
    return true
  }

  const [database] = await tx
    .select({ slug: databaseTable.slug })
    .from(databaseTable)
    .where(and(eq(databaseTable.environmentUuid, environmentUuid), eq(databaseTable.slug, name)))
    .limit(1)
  return Boolean(database)
}
