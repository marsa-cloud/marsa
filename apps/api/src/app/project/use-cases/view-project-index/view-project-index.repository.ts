import { Injectable } from '@nestjs/common'
import { desc, lt } from 'drizzle-orm'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { ProjectUuid } from '#src/app/project/entities/project.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewProjectIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async listProjects(limit: number, after?: ProjectUuid | null): Promise<Project[]> {
    return this.db
      .select()
      .from(projectTable)
      .where(after ? lt(projectTable.uuid, after) : undefined)
      .orderBy(desc(projectTable.uuid))
      .limit(limit)
  }
}
