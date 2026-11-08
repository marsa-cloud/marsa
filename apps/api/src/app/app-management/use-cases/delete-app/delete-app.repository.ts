import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import {
  type AppPlacement,
  selectAppPlacement,
} from '#src/app/app-management/queries/app-placement.js'
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

  async markDeletionRequested(tx: Executor, appUuid: AppUuid): Promise<void> {
    await tx
      .update(appTable)
      .set({ deletionRequestedAt: new Date() })
      .where(eq(appTable.uuid, appUuid))
  }

  async clearDeletionFailure(tx: Executor, appUuid: AppUuid): Promise<void> {
    await tx
      .update(appTable)
      .set({ deletionFailedAt: null, deletionError: null })
      .where(eq(appTable.uuid, appUuid))
  }
}
