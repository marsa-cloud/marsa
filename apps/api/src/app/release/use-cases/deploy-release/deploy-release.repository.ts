import { Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import {
  type AppPlacement,
  appPlacementFields,
} from '#src/app/app-management/queries/app-placement.js'
import { environmentTable } from '#src/app/environment/entities/environment.table.js'
import { projectTable } from '#src/app/project/entities/project.table.js'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import type { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class DeployReleaseRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  // One statement, so the app and its newest release can't be read as a torn pair.
  // uuidv7 sorts by creation time, which is the order the release list uses too.
  async findAppWithNewestRelease(
    slug: string,
  ): Promise<{ placement: AppPlacement; release: Release | null } | undefined> {
    // Not selectAppPlacement(): a partial select fixes the row shape, so the release has to be
    // selected alongside the placement fields rather than joined onto the shared query.
    const [row] = await this.db
      .select({ ...appPlacementFields, release: releaseTable })
      .from(appTable)
      .innerJoin(environmentTable, eq(appTable.environmentUuid, environmentTable.uuid))
      .innerJoin(projectTable, eq(environmentTable.projectUuid, projectTable.uuid))
      .leftJoin(
        releaseTable,
        and(
          eq(releaseTable.appUuid, appTable.uuid),
          eq(
            releaseTable.uuid,
            sql`(select newest.uuid from ${releaseTable} newest where newest.app_uuid = ${appTable.uuid} order by newest.uuid desc limit 1)`,
          ),
        ),
      )
      .where(eq(appTable.slug, slug))
      .limit(1)

    if (!row) {
      return undefined
    }
    const { release, ...placement } = row
    return { placement, release }
  }

  async setDeployStatus(uuid: ReleaseUuid, deployStatus: DeployStatus): Promise<void> {
    await this.db.update(releaseTable).set({ deployStatus }).where(eq(releaseTable.uuid, uuid))
  }
}
