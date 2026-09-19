import { Injectable } from '@nestjs/common'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class CreateAppRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async insert(app: App): Promise<boolean> {
    const rows = await this.db
      .insert(appTable)
      .values(app)
      .onConflictDoNothing({ target: appTable.slug })
      .returning({ uuid: appTable.uuid })
    return rows.length > 0
  }
}
