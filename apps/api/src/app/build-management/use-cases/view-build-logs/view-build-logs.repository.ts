import { Injectable } from '@nestjs/common'
import type { Build } from '#src/app/build-management/entities/build.table.js'
import type { BuildUuid } from '#src/app/build-management/entities/build.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewBuildLogsRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findBuild(slug: string, uuid: BuildUuid): Promise<Build | undefined> {
    return this.db.query.buildTable.findFirst({ where: { uuid: { eq: uuid }, app: { slug } } })
  }
}
