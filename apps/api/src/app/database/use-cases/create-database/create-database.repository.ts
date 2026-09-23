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

  async insert(tx: Executor, database: DatabaseRow): Promise<void> {
    await tx.insert(databaseTable).values(database)
  }
}
