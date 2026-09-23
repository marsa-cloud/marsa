import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { type Build, buildTable } from '#src/app/build/entities/build.table.js'
import type { BuildUuid } from '#src/app/build/entities/build.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewBuildLogsRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findBuild(slug: string, uuid: BuildUuid): Promise<Build | undefined> {
    const [row] = await this.db
      .select({ build: buildTable })
      .from(buildTable)
      .innerJoin(appTable, eq(buildTable.appUuid, appTable.uuid))
      .where(and(eq(appTable.slug, slug), eq(buildTable.uuid, uuid)))
      .limit(1)
    return row?.build
  }
}
