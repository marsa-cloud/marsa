import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import { type Build, buildTable, type NewBuild } from '#src/app/build/entities/build.table.js'
import type { BuildUuid } from '#src/app/build/entities/build.uuid.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

export interface InstallationCredentials {
  installationId: string
  githubAppId: string
  privateKeyPemEnc: string
}

@Injectable()
export class BuildStarterRepository {
  async cancelRunning(tx: Executor, appUuid: AppUuid): Promise<Build[]> {
    return tx
      .update(buildTable)
      .set({ status: BuildStatus.Cancelled })
      .where(and(eq(buildTable.appUuid, appUuid), eq(buildTable.status, BuildStatus.Running)))
      .returning()
  }

  async insert(tx: Executor, build: NewBuild): Promise<Build> {
    const [inserted] = await tx.insert(buildTable).values(build).returning()
    if (!inserted) {
      throw new Error('Inserting a build returned no row')
    }
    return inserted
  }

  async fail(tx: Executor, uuid: BuildUuid, failureReason: string): Promise<Build> {
    const [failed] = await tx
      .update(buildTable)
      .set({ status: BuildStatus.Failed, failureReason })
      .where(eq(buildTable.uuid, uuid))
      .returning()
    if (!failed) {
      throw new Error(`Build ${uuid} vanished while failing it`)
    }
    return failed
  }

  async findCredentials(
    tx: Executor,
    installationUuid: GitHubInstallationUuid,
  ): Promise<InstallationCredentials | undefined> {
    const [row] = await tx
      .select({
        installationId: githubInstallationTable.installationId,
        githubAppId: githubAppTable.githubAppId,
        privateKeyPemEnc: githubAppTable.privateKeyPemEnc,
      })
      .from(githubInstallationTable)
      .innerJoin(githubAppTable, eq(githubInstallationTable.appUuid, githubAppTable.uuid))
      .where(eq(githubInstallationTable.uuid, installationUuid))
      .limit(1)
    return row
  }
}
