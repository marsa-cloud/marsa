import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import type { AppConfig } from '#src/app/release/entities/release-snapshot.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class CreateReleaseRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findAppBySlug(slug: string): Promise<App | undefined> {
    const [app] = await this.db.select().from(appTable).where(eq(appTable.slug, slug)).limit(1)
    return app
  }

  async findRelease(uuid: ReleaseUuid): Promise<Release | undefined> {
    const [release] = await this.db
      .select()
      .from(releaseTable)
      .where(eq(releaseTable.uuid, uuid))
      .limit(1)
    return release
  }

  // A rollback restores the app's config too, so the next deploy doesn't undo it.
  async createRelease(release: Release, restoredConfig: AppConfig | null): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(releaseTable).values(release)
      if (restoredConfig) {
        await tx.update(appTable).set(restoredConfig).where(eq(appTable.uuid, release.appUuid))
      }
    })
  }
}
