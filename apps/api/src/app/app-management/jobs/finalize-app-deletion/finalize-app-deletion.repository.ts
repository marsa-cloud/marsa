import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import { buildTable } from '#src/app/build-management/entities/build.table.js'
import { releaseTable } from '#src/app/release/entities/release.table.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

@Injectable()
export class FinalizeAppDeletionRepository {
  // Releases reference builds and both reference the app, none with a cascade.
  async deleteWithHistory(tx: Executor, appUuid: AppUuid): Promise<void> {
    await tx.delete(releaseTable).where(eq(releaseTable.appUuid, appUuid))
    await tx.delete(buildTable).where(eq(buildTable.appUuid, appUuid))
    await tx.delete(appTable).where(eq(appTable.uuid, appUuid))
  }
}
