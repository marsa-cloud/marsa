import { eq } from 'drizzle-orm'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
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
