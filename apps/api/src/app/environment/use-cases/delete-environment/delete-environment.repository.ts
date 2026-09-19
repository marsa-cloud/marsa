import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { isForeignKeyViolation } from '#src/modules/database/postgres-errors.js'

@Injectable()
export class DeleteEnvironmentRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findBySlugs(
    projectSlug: string,
    environmentSlug: string,
  ): Promise<{ project: Project; environment: Environment } | undefined> {
    const [row] = await this.db
      .select({ project: projectTable, environment: environmentTable })
      .from(environmentTable)
      .innerJoin(projectTable, eq(environmentTable.projectUuid, projectTable.uuid))
      .where(and(eq(projectTable.slug, projectSlug), eq(environmentTable.slug, environmentSlug)))
      .limit(1)
    return row
  }

  // The app FK is RESTRICT, so the DELETE itself fails while apps remain — no check-then-act race.
  async deleteThen(
    uuid: EnvironmentUuid,
    afterDelete: () => Promise<void>,
  ): Promise<'deleted' | 'in-use'> {
    try {
      await this.db.transaction(async (tx) => {
        await tx.delete(environmentTable).where(eq(environmentTable.uuid, uuid))
        await afterDelete()
      })
      return 'deleted'
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return 'in-use'
      }
      throw error
    }
  }
}
