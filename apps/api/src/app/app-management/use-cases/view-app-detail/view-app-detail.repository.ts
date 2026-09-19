import { Injectable } from '@nestjs/common'
import { and, desc, eq, ne } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewAppDetailRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findBySlug(slug: string): Promise<App | undefined> {
    const [app] = await this.db.select().from(appTable).where(eq(appTable.slug, slug)).limit(1)
    return app
  }

  // A failed release never ran, so it can't be what's live — compare against the one before it.
  async findNewestNonFailedRelease(appUuid: AppUuid): Promise<Release | undefined> {
    const [release] = await this.db
      .select()
      .from(releaseTable)
      .where(
        and(eq(releaseTable.appUuid, appUuid), ne(releaseTable.deployStatus, DeployStatus.Failed)),
      )
      .orderBy(desc(releaseTable.uuid))
      .limit(1)
    return release
  }
}
