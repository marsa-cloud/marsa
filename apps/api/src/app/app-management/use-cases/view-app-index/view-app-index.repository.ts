import { Injectable } from '@nestjs/common'
import { desc, lt } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewAppIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async listApps(limit: number, after?: AppUuid | null): Promise<App[]> {
    return this.db
      .select()
      .from(appTable)
      .where(after ? lt(appTable.uuid, after) : undefined)
      .orderBy(desc(appTable.uuid))
      .limit(limit)
  }
}
