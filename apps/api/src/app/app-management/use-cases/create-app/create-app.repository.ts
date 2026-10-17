import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import {
  type Build,
  buildTable,
  type NewBuild,
} from '#src/app/build-management/entities/build.table.js'
import type { BuildUuid } from '#src/app/build-management/entities/build.uuid.js'
import { BuildStatus } from '#src/app/build-management/enums/build-status.enum.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import type { EnvironmentPlacement } from '#src/app/environment/queries/environment-placement.js'
import { findEnvironmentPlacementForUpdate } from '#src/app/environment/queries/find-environment-placement-for-update.js'
import { isNameTakenInEnvironment } from '#src/app/environment/queries/name-taken-in-environment.js'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import {
  type InstallationCredentials,
  selectInstallationCredentials,
} from '#src/app/github-app/queries/installation-credentials.js'
import type { Database, Executor } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class CreateAppRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  findEnvironmentForUpdate(
    tx: Executor,
    uuid: EnvironmentUuid,
  ): Promise<EnvironmentPlacement | undefined> {
    return findEnvironmentPlacementForUpdate(tx, uuid)
  }

  isNameTaken(tx: Executor, environmentUuid: EnvironmentUuid, slug: string): Promise<boolean> {
    return isNameTakenInEnvironment(tx, environmentUuid, slug)
  }

  async findInstallationCredentials(
    installationUuid: GitHubInstallationUuid,
  ): Promise<InstallationCredentials | undefined> {
    const [row] = await selectInstallationCredentials(this.db)
      .where(eq(githubInstallationTable.uuid, installationUuid))
      .limit(1)
    return row
  }

  // Existence is already settled by the environment lock; this guards the global slug constraint.
  async insert(tx: Executor, app: App): Promise<'inserted' | 'slug-taken'> {
    const rows = await tx
      .insert(appTable)
      .values(app)
      .onConflictDoNothing({ target: appTable.slug })
      .returning({ uuid: appTable.uuid })
    return rows.length > 0 ? 'inserted' : 'slug-taken'
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
