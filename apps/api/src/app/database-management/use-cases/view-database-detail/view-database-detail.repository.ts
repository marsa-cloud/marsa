import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { databaseTable } from '#src/app/database-management/entities/database.table.js'
import {
  type DatabasePlacement,
  selectDatabasePlacement,
} from '#src/app/database-management/queries/database-placement.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewDatabaseDetailRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findPlacementBySlug(slug: string): Promise<DatabasePlacement | undefined> {
    const [placement] = await selectDatabasePlacement(this.db)
      .where(eq(databaseTable.slug, slug))
      .limit(1)
    return placement
  }
}
