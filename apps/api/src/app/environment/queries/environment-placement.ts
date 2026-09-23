import { eq } from 'drizzle-orm'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

export interface EnvironmentPlacement {
  environment: Environment
  project: Project
}

export function selectEnvironmentPlacement(db: Executor) {
  return db
    .select({ environment: environmentTable, project: projectTable })
    .from(environmentTable)
    .innerJoin(projectTable, eq(environmentTable.projectUuid, projectTable.uuid))
}

/** Locked: cross-table name uniqueness is not a constraint, so concurrent creates in one
 * environment have to serialise on its row. */
export async function lockEnvironmentPlacement(
  tx: Executor,
  uuid: EnvironmentUuid,
): Promise<EnvironmentPlacement | undefined> {
  const [placement] = await selectEnvironmentPlacement(tx)
    .where(eq(environmentTable.uuid, uuid))
    .limit(1)
    .for('update', { of: environmentTable })
  return placement
}
