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

export const appPlacementFields = {
  app: appTable,
  environment: environmentTable,
  project: projectTable,
}

export function selectAppPlacement(db: Executor) {
  return db
    .select(appPlacementFields)
    .from(appTable)
    .innerJoin(environmentTable, eq(appTable.environmentUuid, environmentTable.uuid))
    .innerJoin(projectTable, eq(environmentTable.projectUuid, projectTable.uuid))
}
