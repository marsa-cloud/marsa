import { Injectable } from '@nestjs/common'
import { type DatabaseRow, databaseTable } from '#src/app/database/entities/database.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import {
  type EnvironmentPlacement,
  lockEnvironmentPlacement,
} from '#src/app/environment/queries/environment-placement.js'
import { isNameTakenInEnvironment } from '#src/app/environment/queries/name-taken-in-environment.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

@Injectable()
export class CreateDatabaseRepository {
  lockEnvironment(tx: Executor, uuid: EnvironmentUuid): Promise<EnvironmentPlacement | undefined> {
    return lockEnvironmentPlacement(tx, uuid)
  }

  isNameTaken(tx: Executor, environmentUuid: EnvironmentUuid, slug: string): Promise<boolean> {
    return isNameTakenInEnvironment(tx, environmentUuid, slug)
  }

  // The name check covers one environment; this guards the global slug constraint.
  async insert(tx: Executor, database: DatabaseRow): Promise<'inserted' | 'slug-taken'> {
    const rows = await tx
      .insert(databaseTable)
      .values(database)
      .onConflictDoNothing({ target: databaseTable.slug })
      .returning({ uuid: databaseTable.uuid })
    return rows.length > 0 ? 'inserted' : 'slug-taken'
  }
}
