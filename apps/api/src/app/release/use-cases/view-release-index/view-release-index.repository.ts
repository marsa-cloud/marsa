import { Injectable } from '@nestjs/common'
import { desc, eq, getTableColumns } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import type { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewReleaseIndexRepository {
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
