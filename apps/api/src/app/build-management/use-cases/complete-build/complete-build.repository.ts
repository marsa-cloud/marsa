import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import {
  type AppPlacement,
  selectAppPlacement,
} from '#src/app/app-management/queries/app-placement.js'
import { type Build, buildTable } from '#src/app/build-management/entities/build.table.js'
import type { BuildUuid } from '#src/app/build-management/entities/build.uuid.js'
import { BuildStatus } from '#src/app/build-management/enums/build-status.enum.js'
import type { BuildOutcome } from '#src/app/build-management/use-cases/complete-build/complete-build.types.js'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import type { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

@Injectable()
export class CompleteBuildRepository {
  // SKIP LOCKED: another api replica's sweep moves on instead of waiting for this one.
  async claimRunning(tx: Executor, uuid: BuildUuid): Promise<Build | undefined> {
    const [build] = await tx
      .select()
      .from(buildTable)
      .where(and(eq(buildTable.uuid, uuid), eq(buildTable.status, BuildStatus.Running)))
      .limit(1)
      .for('update', { skipLocked: true })
    return build
  }

  async finish(tx: Executor, uuid: BuildUuid, outcome: BuildOutcome): Promise<void> {
    await tx.update(buildTable).set(outcome).where(eq(buildTable.uuid, uuid))
  }

  async findPlacement(tx: Executor, appUuid: AppUuid): Promise<AppPlacement | undefined> {
    const [placement] = await selectAppPlacement(tx)
      .where(eq(appTable.uuid, appUuid))
      .limit(1)
      .for('update', { of: appTable })
    return placement
  }

  async setAppImage(tx: Executor, appUuid: AppUuid, image: string): Promise<void> {
    await tx.update(appTable).set({ image }).where(eq(appTable.uuid, appUuid))
  }

  async insertRelease(tx: Executor, release: Release): Promise<void> {
    await tx.insert(releaseTable).values(release)
  }

  async setReleaseDeployStatus(
    tx: Executor,
    uuid: ReleaseUuid,
    deployStatus: DeployStatus,
  ): Promise<void> {
    await tx.update(releaseTable).set({ deployStatus }).where(eq(releaseTable.uuid, uuid))
  }
}
