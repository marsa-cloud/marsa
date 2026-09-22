import { Injectable } from '@nestjs/common'
import { desc, eq } from 'drizzle-orm'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { ProjectUuid } from '#src/app/project/entities/project.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

// Operator-created and few, so the list is unpaginated; the cap is a safety net, not a page size.
const MAX_ENVIRONMENTS = 500

@Injectable()
export class ViewEnvironmentIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findProjectBySlug(slug: string): Promise<Project | undefined> {
    const [project] = await this.db
      .select()
      .from(projectTable)
      .where(eq(projectTable.slug, slug))
      .limit(1)
    return project
  }

  async listEnvironments(projectUuid: ProjectUuid): Promise<Environment[]> {
    return this.db
      .select()
      .from(environmentTable)
      .where(eq(environmentTable.projectUuid, projectUuid))
      .orderBy(desc(environmentTable.uuid))
      .limit(MAX_ENVIRONMENTS)
  }
}
