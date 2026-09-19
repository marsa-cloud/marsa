import { Injectable } from '@nestjs/common'
import { desc, eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import {
  type AppPlacement,
  selectAppPlacement,
} from '#src/app/app-management/entities/app-placement.js'
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
  ): Promise<{ placement: AppPlacement; release: Release | null } | undefined> {
    const [placement] = await selectAppPlacement(this.db).where(eq(appTable.slug, slug)).limit(1)
    if (!placement) {
      return undefined
    }
    const [release] = await this.db
      .select()
      .from(releaseTable)
      .where(eq(releaseTable.appUuid, placement.app.uuid))
      .orderBy(desc(releaseTable.uuid))
      .limit(1)
    return { placement, release: release ?? null }
  }

  async setDeployStatus(uuid: ReleaseUuid, deployStatus: DeployStatus): Promise<void> {
    await this.db.update(releaseTable).set({ deployStatus }).where(eq(releaseTable.uuid, uuid))
  }
}
