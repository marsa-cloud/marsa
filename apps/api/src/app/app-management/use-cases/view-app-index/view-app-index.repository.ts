import { Injectable } from '@nestjs/common'
import { desc, lt } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewAppIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  /**
   * One page of apps, newest first. Ordered by the uuidv7 primary key rather
   * than `createdAt`: the two agree (both stamped at insert) and the PK index
   * already serves the seek, so no composite index is needed.
   */
  async listApps(limit: number, after?: AppUuid | null): Promise<App[]> {
    return this.db
      .select()
      .from(appTable)
      .where(after ? lt(appTable.uuid, after) : undefined)
      .orderBy(desc(appTable.uuid))
      .limit(limit)
  }
}
