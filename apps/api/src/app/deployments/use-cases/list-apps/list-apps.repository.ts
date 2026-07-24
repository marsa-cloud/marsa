import { Injectable } from '@nestjs/common'
import { desc } from 'drizzle-orm'
import { type App, appTable } from '#src/app/deployments/entities/app.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ListAppsRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  /** All apps, newest first. */
  async listApps(): Promise<App[]> {
    return this.db.select().from(appTable).orderBy(desc(appTable.createdAt))
  }
}
