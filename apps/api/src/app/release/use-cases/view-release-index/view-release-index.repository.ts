import { Injectable } from '@nestjs/common'
import { and, desc, eq, lt } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import {
  type AppPlacement,
  selectAppPlacement,
} from '#src/app/app-management/queries/app-placement.js'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import type { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewReleaseIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findByAppSlug(slug: string, limit: number, after?: ReleaseUuid | null): Promise<Release[]> {
    const rows = await this.db
      .select({ release: releaseTable })
      .from(releaseTable)
      .innerJoin(appTable, eq(releaseTable.appUuid, appTable.uuid))
      .where(and(eq(appTable.slug, slug), after ? lt(releaseTable.uuid, after) : undefined))
      .orderBy(desc(releaseTable.uuid))
      .limit(limit)
    return rows.map((row) => row.release)
  }

  async findPlacement(slug: string): Promise<AppPlacement | undefined> {
    const [placement] = await selectAppPlacement(this.db).where(eq(appTable.slug, slug)).limit(1)
    return placement
  }

  async setReleaseDeployStatus(uuid: ReleaseUuid, deployStatus: DeployStatus): Promise<void> {
    await this.db.update(releaseTable).set({ deployStatus }).where(eq(releaseTable.uuid, uuid))
  }
}
