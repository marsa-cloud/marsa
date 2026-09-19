import { Injectable } from '@nestjs/common'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class CreateProjectRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async insert(project: Project): Promise<boolean> {
    const rows = await this.db
      .insert(projectTable)
      .values(project)
      .onConflictDoNothing({ target: projectTable.slug })
      .returning({ uuid: projectTable.uuid })
    return rows.length > 0
  }
}
