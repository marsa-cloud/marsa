import { Injectable } from '@nestjs/common'
import { type App } from '#src/app/app-management/entities/app.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewAppIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  /** All apps, newest first. */
  async listApps(): Promise<App[]> {
    return this.db.query.appTable.findMany({ orderBy: { createdAt: 'desc' } })
  }
}
