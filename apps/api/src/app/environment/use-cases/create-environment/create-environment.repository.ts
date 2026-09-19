import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class CreateEnvironmentRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findProjectBySlug(slug: string): Promise<Project | undefined> {
    const [project] = await this.db
      .select()
      .from(projectTable)
      .where(eq(projectTable.slug, slug))
      .limit(1)
    return project
  }

  // afterInsert runs inside the transaction: if it throws, the row is rolled back with it.
  async insertThen(environment: Environment, afterInsert: () => Promise<void>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(environmentTable)
        .values(environment)
        .onConflictDoNothing({ target: [environmentTable.projectUuid, environmentTable.slug] })
        .returning({ uuid: environmentTable.uuid })
      if (rows.length === 0) {
        return false
      }
      await afterInsert()
      return true
    })
  }
}
