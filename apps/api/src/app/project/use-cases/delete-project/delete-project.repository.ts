import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { projectTable } from '#src/app/project/entities/project.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { isForeignKeyViolation } from '#src/modules/database/postgres-errors.js'

@Injectable()
export class DeleteProjectRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  // The environment FK is RESTRICT, so a project with environments fails here, race-free.
  async delete(slug: string): Promise<'deleted' | 'not-found' | 'in-use'> {
    try {
      const rows = await this.db
        .delete(projectTable)
        .where(eq(projectTable.slug, slug))
        .returning({ uuid: projectTable.uuid })
      return rows.length > 0 ? 'deleted' : 'not-found'
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return 'in-use'
      }
      throw error
    }
  }
}
