import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewAppDetailRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findBySlug(slug: string): Promise<App | undefined> {
    const [app] = await this.db.select().from(appTable).where(eq(appTable.slug, slug)).limit(1)
    return app
  }

  async findRelease(uuid: ReleaseUuid, appUuid: AppUuid): Promise<Release | undefined> {
    const [release] = await this.db
      .select()
      .from(releaseTable)
      .where(and(eq(releaseTable.uuid, uuid), eq(releaseTable.appUuid, appUuid)))
      .limit(1)
    return release
  }
}
