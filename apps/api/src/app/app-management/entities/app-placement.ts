import { eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

export interface AppPlacement {
  app: App
  environment: Environment
  project: Project
}

export function selectAppPlacement(db: Executor) {
  return db
    .select({ app: appTable, environment: environmentTable, project: projectTable })
    .from(appTable)
    .innerJoin(environmentTable, eq(appTable.environmentUuid, environmentTable.uuid))
    .innerJoin(projectTable, eq(environmentTable.projectUuid, projectTable.uuid))
}
