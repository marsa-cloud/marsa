import { eq } from 'drizzle-orm'
import { environmentTable } from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import {
  type EnvironmentPlacement,
  selectEnvironmentPlacement,
} from '#src/app/environment/queries/environment-placement.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

// No constraint spans apps and databases, so creates in one environment serialise on its row.
export async function findEnvironmentPlacementForUpdate(
  tx: Executor,
  uuid: EnvironmentUuid,
): Promise<EnvironmentPlacement | undefined> {
  const [placement] = await selectEnvironmentPlacement(tx)
    .where(eq(environmentTable.uuid, uuid))
    .limit(1)
    .for('update', { of: environmentTable })
  return placement
}
