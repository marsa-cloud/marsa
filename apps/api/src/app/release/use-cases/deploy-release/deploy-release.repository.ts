import { Injectable } from '@nestjs/common'
import { desc, eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import {
  type AppPlacement,
  selectAppPlacement,
} from '#src/app/app-management/queries/app-placement.js'
import {
  type AttachedDatabase,
  selectAttachmentsForApp,
} from '#src/app/database-management/queries/app-attachments.js'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

@Injectable()
export class DeployReleaseRepository {
  // The app row lock also serialises two deploys of one app, so the newest-release read agrees.
  async findPlacement(tx: Executor, slug: string): Promise<AppPlacement | undefined> {
    const [placement] = await selectAppPlacement(tx)
      .where(eq(appTable.slug, slug))
      .limit(1)
      .for('update', { of: appTable })
    return placement
  }

  // uuidv7 sorts by creation time, which is the order the release list uses too.
  async findNewestRelease(tx: Executor, appUuid: AppUuid): Promise<Release | null> {
    const [release] = await tx
      .select()
      .from(releaseTable)
      .where(eq(releaseTable.appUuid, appUuid))
      .orderBy(desc(releaseTable.uuid))
      .limit(1)
    return release ?? null
  }

  async setDeployStatus(
    tx: Executor,
    uuid: ReleaseUuid,
    deployStatus: DeployStatus,
  ): Promise<void> {
    await tx.update(releaseTable).set({ deployStatus }).where(eq(releaseTable.uuid, uuid))
  }

  // Attachments are placement, so they are read live rather than restored from the release.
  findAttachments(tx: Executor, appUuid: AppUuid): Promise<AttachedDatabase[]> {
    return selectAttachmentsForApp(tx, appUuid)
  }
}
