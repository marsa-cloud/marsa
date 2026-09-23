import { Injectable } from '@nestjs/common'
import { desc, lt } from 'drizzle-orm'
import { databaseTable } from '#src/app/database/entities/database.table.js'
import type { DatabaseUuid } from '#src/app/database/entities/database.uuid.js'
import {
  type DatabasePlacement,
  selectDatabasePlacement,
} from '#src/app/database/queries/database-placement.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewDatabaseIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async listDatabases(limit: number, after?: DatabaseUuid | null): Promise<DatabasePlacement[]> {
    return selectDatabasePlacement(this.db)
      .where(after ? lt(databaseTable.uuid, after) : undefined)
      .orderBy(desc(databaseTable.uuid))
      .limit(limit)
  }
}
