import { Injectable } from '@nestjs/common'
import { and, asc, eq, gt } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { type Build, buildTable } from '#src/app/build-management/entities/build.table.js'
import type { BuildUuid } from '#src/app/build-management/entities/build.uuid.js'
import { BuildStatus } from '#src/app/build-management/enums/build-status.enum.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

export interface RunningBuild {
  build: Build
  appSlug: string
}

@Injectable()
export class SweepBuildsRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findRunning(limit: number, after?: BuildUuid): Promise<RunningBuild[]> {
    return this.db
      .select({ build: buildTable, appSlug: appTable.slug })
      .from(buildTable)
      .innerJoin(appTable, eq(buildTable.appUuid, appTable.uuid))
      .where(
        and(
          eq(buildTable.status, BuildStatus.Running),
          after ? gt(buildTable.uuid, after) : undefined,
        ),
      )
      .orderBy(asc(buildTable.uuid))
      .limit(limit)
  }
}
