import { Injectable } from '@nestjs/common'
import { desc, eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import type { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class DeployReleaseRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findRelease(uuid: ReleaseUuid): Promise<Release | undefined> {
    const [release] = await this.db
      .select()
      .from(releaseTable)
      .where(eq(releaseTable.uuid, uuid))
      .limit(1)
    return release
  }

  async findApp(uuid: AppUuid): Promise<App | undefined> {
    const [app] = await this.db.select().from(appTable).where(eq(appTable.uuid, uuid)).limit(1)
    return app
  }

  // uuidv7 sorts by creation time, which is the order the release list uses too.
  async findNewestReleaseUuid(appUuid: AppUuid): Promise<ReleaseUuid | undefined> {
    const [newest] = await this.db
      .select({ uuid: releaseTable.uuid })
      .from(releaseTable)
      .where(eq(releaseTable.appUuid, appUuid))
      .orderBy(desc(releaseTable.uuid))
      .limit(1)
    return newest?.uuid
  }

  async setDeployStatus(uuid: ReleaseUuid, deployStatus: DeployStatus): Promise<void> {
    await this.db.update(releaseTable).set({ deployStatus }).where(eq(releaseTable.uuid, uuid))
  }
}
