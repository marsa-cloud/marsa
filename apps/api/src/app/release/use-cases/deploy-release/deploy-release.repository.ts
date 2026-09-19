import { Injectable } from '@nestjs/common'
import { desc, eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import type { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class DeployReleaseRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  // uuidv7 sorts by creation time, which is the order the release list uses too.
  async findAppWithNewestRelease(
    slug: string,
  ): Promise<{ app: App; release: Release | null } | undefined> {
    const [row] = await this.db
      .select({ app: appTable, release: releaseTable })
      .from(appTable)
      .leftJoin(releaseTable, eq(releaseTable.appUuid, appTable.uuid))
      .where(eq(appTable.slug, slug))
      .orderBy(desc(releaseTable.uuid))
      .limit(1)
    return row
  }

  async setDeployStatus(uuid: ReleaseUuid, deployStatus: DeployStatus): Promise<void> {
    await this.db.update(releaseTable).set({ deployStatus }).where(eq(releaseTable.uuid, uuid))
  }
}
