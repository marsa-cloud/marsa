import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

@Injectable()
export class AppDeletionFailedRepository {
  async markDeletionFailed(tx: Executor, appUuid: AppUuid, error: string): Promise<void> {
    await tx
      .update(appTable)
      .set({ deletionFailedAt: new Date(), deletionError: error })
      .where(eq(appTable.uuid, appUuid))
  }
}
