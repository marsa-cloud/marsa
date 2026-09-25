import { Injectable } from '@nestjs/common'
import { and, desc, eq, lt } from 'drizzle-orm'
import { databaseTable } from '#src/app/database-management/entities/database.table.js'
import type { DatabaseUuid } from '#src/app/database-management/entities/database.uuid.js'
import {
  type DatabasePlacement,
  selectDatabasePlacement,
} from '#src/app/database-management/queries/database-placement.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewDatabaseIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async listDatabases(
    limit: number,
    after?: DatabaseUuid | null,
    environmentUuid?: EnvironmentUuid,
  ): Promise<DatabasePlacement[]> {
    const filters = [
      after ? lt(databaseTable.uuid, after) : undefined,
      environmentUuid ? eq(databaseTable.environmentUuid, environmentUuid) : undefined,
    ].filter((filter) => filter !== undefined)

    return selectDatabasePlacement(this.db)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(databaseTable.uuid))
      .limit(limit)
  }
}
