import { Injectable } from '@nestjs/common'
import { and, desc, eq, lt } from 'drizzle-orm'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { ProjectUuid } from '#src/app/project/entities/project.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

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

  async listEnvironments(
    projectUuid: ProjectUuid,
    limit: number,
    after?: EnvironmentUuid | null,
  ): Promise<Environment[]> {
    return this.db
      .select()
      .from(environmentTable)
      .where(
        and(
          eq(environmentTable.projectUuid, projectUuid),
          after ? lt(environmentTable.uuid, after) : undefined,
        ),
      )
      .orderBy(desc(environmentTable.uuid))
      .limit(limit)
  }
}
