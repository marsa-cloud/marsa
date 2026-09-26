import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import {
  type AppPlacement,
  selectAppPlacement,
} from '#src/app/app-management/queries/app-placement.js'
import { type Build, buildTable } from '#src/app/build-management/entities/build.table.js'
import { BuildStatus } from '#src/app/build-management/enums/build-status.enum.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

@Injectable()
export class DeleteAppRepository {
  async findBySlug(tx: Executor, slug: string): Promise<AppPlacement | undefined> {
    const [placement] = await selectAppPlacement(tx)
      .where(eq(appTable.slug, slug))
      .limit(1)
      .for('update', { of: appTable })
    return placement
  }

  async findRunningBuilds(tx: Executor, appUuid: AppUuid): Promise<Build[]> {
    return tx
      .select()
      .from(buildTable)
      .where(and(eq(buildTable.appUuid, appUuid), eq(buildTable.status, BuildStatus.Running)))
  }

  // Releases reference builds and both reference the app, none with a cascade.
  async deleteWithHistory(tx: Executor, appUuid: AppUuid): Promise<void> {
    await tx.delete(releaseTable).where(eq(releaseTable.appUuid, appUuid))
    await tx.delete(buildTable).where(eq(buildTable.appUuid, appUuid))
    await tx.delete(appTable).where(eq(appTable.uuid, appUuid))
  }
}
