import { Injectable } from '@nestjs/common'
import { and, desc, eq, lt } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import { type Build, buildTable } from '#src/app/build/entities/build.table.js'
import type { BuildUuid } from '#src/app/build/entities/build.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewBuildIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findByAppSlug(slug: string, limit: number, after?: BuildUuid | null): Promise<Build[]> {
    const rows = await this.db
      .select({ build: buildTable })
      .from(buildTable)
      .innerJoin(appTable, eq(buildTable.appUuid, appTable.uuid))
      .where(and(eq(appTable.slug, slug), after ? lt(buildTable.uuid, after) : undefined))
      .orderBy(desc(buildTable.uuid))
      .limit(limit)
    return rows.map((row) => row.build)
  }
}
