import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import { type Build, buildTable } from '#src/app/build-management/entities/build.table.js'
import type { BuildUuid } from '#src/app/build-management/entities/build.uuid.js'
import { BuildStatus } from '#src/app/build-management/enums/build-status.enum.js'
import type { Database, Executor } from '#src/modules/database/drizzle.factory.js'

@Injectable()
export class CancelAppBuildsRepository {
  async findRunning(db: Database, appUuid: AppUuid): Promise<Build[]> {
    return db
      .select()
      .from(buildTable)
      .where(and(eq(buildTable.appUuid, appUuid), eq(buildTable.status, BuildStatus.Running)))
  }

  async markCancelled(tx: Executor, buildUuid: BuildUuid): Promise<void> {
    await tx
      .update(buildTable)
      .set({ status: BuildStatus.Cancelled })
      .where(and(eq(buildTable.uuid, buildUuid), eq(buildTable.status, BuildStatus.Running)))
  }
}
