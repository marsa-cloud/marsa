import { Injectable } from '@nestjs/common'
import type { Build } from '#src/app/build-management/entities/build.table.js'
import type { BuildUuid } from '#src/app/build-management/entities/build.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewBuildIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findByAppSlug(slug: string, limit: number, after?: BuildUuid | null): Promise<Build[]> {
    return this.db.query.buildTable.findMany({
      where: { app: { slug }, ...(after && { uuid: { lt: after } }) },
      orderBy: { uuid: 'desc' },
      limit,
    })
  }
}
