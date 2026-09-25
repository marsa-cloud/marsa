import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import {
  type DatabaseRow,
  databaseTable,
} from '#src/app/database-management/entities/database.table.js'
import type { DatabaseUuid } from '#src/app/database-management/entities/database.uuid.js'
import { dependentAppsOf } from '#src/app/database-management/queries/dependent-apps.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewDatabaseDependentIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findBySlug(slug: string): Promise<DatabaseRow | undefined> {
    const [database] = await this.db
      .select()
      .from(databaseTable)
      .where(eq(databaseTable.slug, slug))
      .limit(1)
    return database
  }

  listDependents(databaseUuid: DatabaseUuid): Promise<string[]> {
    return dependentAppsOf(this.db, databaseUuid)
  }
}
