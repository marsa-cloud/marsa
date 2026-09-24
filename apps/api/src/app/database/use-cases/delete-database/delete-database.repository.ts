import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { databaseTable } from '#src/app/database/entities/database.table.js'
import type { DatabaseUuid } from '#src/app/database/entities/database.uuid.js'
import {
  type DatabasePlacement,
  selectDatabasePlacement,
} from '#src/app/database/queries/database-placement.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

@Injectable()
export class DeleteDatabaseRepository {
  async findPlacementBySlugForUpdate(
    tx: Executor,
    slug: string,
  ): Promise<DatabasePlacement | undefined> {
    const [placement] = await selectDatabasePlacement(tx)
      .where(eq(databaseTable.slug, slug))
      .limit(1)
      .for('update', { of: databaseTable })
    return placement
  }

  async delete(tx: Executor, uuid: DatabaseUuid): Promise<void> {
    await tx.delete(databaseTable).where(eq(databaseTable.uuid, uuid))
  }
}
