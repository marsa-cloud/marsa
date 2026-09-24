import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import { type Build, buildTable, type NewBuild } from '#src/app/build/entities/build.table.js'
import type { BuildUuid } from '#src/app/build/entities/build.uuid.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import {
  type InstallationCredentials,
  selectInstallationCredentials,
} from '#src/app/github-app/queries/installation-credentials.js'
import type { Database, Executor } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { isForeignKeyViolation } from '#src/modules/database/postgres-errors.js'

@Injectable()
export class CreateAppRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findInstallationCredentials(
    installationUuid: GitHubInstallationUuid,
  ): Promise<InstallationCredentials | undefined> {
    const [row] = await selectInstallationCredentials(this.db)
      .where(eq(githubInstallationTable.uuid, installationUuid))
      .limit(1)
    return row
  }

  // The environment FK is the existence check, so an environment deleted mid-request can't slip past.
  async insert(tx: Executor, app: App): Promise<'inserted' | 'slug-taken' | 'environment-missing'> {
    try {
      const rows = await tx
        .insert(appTable)
        .values(app)
        .onConflictDoNothing({ target: appTable.slug })
        .returning({ uuid: appTable.uuid })
      return rows.length > 0 ? 'inserted' : 'slug-taken'
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return 'environment-missing'
      }
      throw error
    }
  }

  async insertBuild(tx: Executor, build: NewBuild): Promise<Build> {
    const [inserted] = await tx.insert(buildTable).values(build).returning()
    if (!inserted) {
      throw new Error('Inserting a build returned no row')
    }
    return inserted
  }

  async failBuild(tx: Executor, uuid: BuildUuid, failureReason: string): Promise<void> {
    await tx
      .update(buildTable)
      .set({ status: BuildStatus.Failed, failureReason })
      .where(eq(buildTable.uuid, uuid))
  }
}
