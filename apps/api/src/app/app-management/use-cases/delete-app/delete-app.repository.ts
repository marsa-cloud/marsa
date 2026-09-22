import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import {
  type AppPlacement,
  selectAppPlacement,
} from '#src/app/app-management/queries/app-placement.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class DeleteAppRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findBySlug(slug: string): Promise<AppPlacement | undefined> {
    const [placement] = await selectAppPlacement(this.db).where(eq(appTable.slug, slug)).limit(1)
    return placement
  }

  /** Releases first — their FK has no cascade, so deleting the app alone would fail. */
  async deleteWithReleases(appUuid: AppUuid): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(releaseTable).where(eq(releaseTable.appUuid, appUuid))
      await tx.delete(appTable).where(eq(appTable.uuid, appUuid))
    })
  }
}
