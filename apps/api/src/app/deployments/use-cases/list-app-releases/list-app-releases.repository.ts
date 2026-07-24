import { Injectable } from '@nestjs/common'
import { desc, eq, getTableColumns } from 'drizzle-orm'
import { appTable } from '#src/app/deployments/entities/app.table.js'
import { type Release, releaseTable } from '#src/app/deployments/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/deployments/entities/release.uuid.js'
import type { DeployStatus } from '#src/app/deployments/enums/deploy-status.enum.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ListAppReleasesRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findByAppSlug(slug: string): Promise<Release[]> {
    return this.db
      .select(getTableColumns(releaseTable))
      .from(releaseTable)
      .innerJoin(appTable, eq(releaseTable.appUuid, appTable.uuid))
      .where(eq(appTable.slug, slug))
      .orderBy(desc(releaseTable.createdAt))
  }

  async setReleaseDeployStatus(uuid: ReleaseUuid, deployStatus: DeployStatus): Promise<void> {
    await this.db.update(releaseTable).set({ deployStatus }).where(eq(releaseTable.uuid, uuid))
  }
}
