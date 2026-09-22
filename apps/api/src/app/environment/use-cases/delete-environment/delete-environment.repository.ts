import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

@Injectable()
export class DeleteEnvironmentRepository {
  async findBySlugs(
    tx: Executor,
    projectSlug: string,
    environmentSlug: string,
  ): Promise<{ project: Project; environment: Environment } | undefined> {
    const [row] = await tx
      .select({ project: projectTable, environment: environmentTable })
      .from(environmentTable)
      .innerJoin(projectTable, eq(environmentTable.projectUuid, projectTable.uuid))
      .where(and(eq(projectTable.slug, projectSlug), eq(environmentTable.slug, environmentSlug)))
      .limit(1)
      .for('update', { of: environmentTable })
    return row
  }

  async delete(tx: Executor, uuid: EnvironmentUuid): Promise<void> {
    await tx.delete(environmentTable).where(eq(environmentTable.uuid, uuid))
  }
}
