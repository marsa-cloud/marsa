import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class DeleteAppRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findBySlug(slug: string): Promise<App | undefined> {
    const [app] = await this.db.select().from(appTable).where(eq(appTable.slug, slug)).limit(1)
    return app
  }

  /** Releases first — their FK has no cascade, so deleting the app alone would fail. */
  async deleteWithReleases(appUuid: AppUuid): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(releaseTable).where(eq(releaseTable.appUuid, appUuid))
      await tx.delete(appTable).where(eq(appTable.uuid, appUuid))
    })
  }
}
