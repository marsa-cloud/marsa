import { eq } from 'drizzle-orm'
import { type DatabaseRow, databaseTable } from '#src/app/database/entities/database.table.js'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'
import type { DatabaseRef } from '#src/modules/runtime/runtime.types.js'

export interface DatabasePlacement {
  database: DatabaseRow
  environment: Environment
  project: Project
}

export function selectDatabasePlacement(db: Executor) {
  return db
    .select({ database: databaseTable, environment: environmentTable, project: projectTable })
    .from(databaseTable)
    .innerJoin(environmentTable, eq(databaseTable.environmentUuid, environmentTable.uuid))
    .innerJoin(projectTable, eq(environmentTable.projectUuid, projectTable.uuid))
}

// The rows already fit the port's shape, except for the slug the runtime keys on.
export function databaseRefOf({ database, environment, project }: DatabasePlacement): DatabaseRef {
  return { project, environment, database: { slug: database.slug } }
}
