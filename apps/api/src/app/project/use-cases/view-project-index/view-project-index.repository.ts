import { Injectable } from '@nestjs/common'
import { desc } from 'drizzle-orm'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

// Operator-created and few, so the list is unpaginated; the cap is a safety net, not a page size.
const MAX_PROJECTS = 500

@Injectable()
export class ViewProjectIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async listProjects(): Promise<Project[]> {
    return this.db.select().from(projectTable).orderBy(desc(projectTable.uuid)).limit(MAX_PROJECTS)
  }
}
