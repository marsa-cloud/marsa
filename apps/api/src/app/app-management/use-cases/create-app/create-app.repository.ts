import { Injectable } from '@nestjs/common'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { isForeignKeyViolation } from '#src/modules/database/postgres-errors.js'

@Injectable()
export class CreateAppRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  // The environment FK is the existence check, so an environment deleted mid-request can't slip past.
  async insert(app: App): Promise<'inserted' | 'slug-taken' | 'environment-missing'> {
    try {
      const rows = await this.db
        .insert(appTable)
        .values(app)
        .onConflictDoNothing({ target: appTable.slug })
        .returning({ uuid: appTable.uuid })
      return rows.length > 0 ? 'inserted' : 'slug-taken'
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return 'environment-missing'
      }
      throw error
    }
  }
}
