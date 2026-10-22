import { Injectable } from '@nestjs/common'
import { and, desc, eq, sql } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import { buildTable } from '#src/app/build-management/entities/build.table.js'
import { BuildStatus } from '#src/app/build-management/enums/build-status.enum.js'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import type { Database, Executor } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import type { GitHubPush } from '#src/modules/github-client/github-push.js'

@Injectable()
export class ReceivePushRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findSecretByInstallation(installationId: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ webhookSecretEnc: githubAppTable.webhookSecretEnc })
      .from(githubInstallationTable)
      .innerJoin(githubAppTable, eq(githubInstallationTable.appUuid, githubAppTable.uuid))
      .where(eq(githubInstallationTable.installationId, installationId))
      .limit(1)
    return row?.webhookSecretEnc
  }

  async findNewestSecret(): Promise<string | undefined> {
    const [row] = await this.db
      .select({ webhookSecretEnc: githubAppTable.webhookSecretEnc })
      .from(githubAppTable)
      .orderBy(desc(githubAppTable.createdAt))
      .limit(1)
    return row?.webhookSecretEnc
  }

  // Matching the installation too stops one installation's pushes building another's apps.
  async findAppsToBuild(push: GitHubPush): Promise<App[]> {
    const rows = await this.db
      .select({ app: appTable })
      .from(appTable)
      .innerJoin(
        githubInstallationTable,
        sql`${githubInstallationTable.uuid} = (${appTable.source}->>'installationUuid')::uuid`,
      )
      .where(
        and(
          sql`${appTable.source}->>'repo' = ${push.repo}`,
          sql`${appTable.source}->>'branch' = ${push.branch}`,
          eq(githubInstallationTable.installationId, push.installationId),
        ),
      )
      .orderBy(appTable.slug)
    return rows.map((row) => row.app)
  }

  async lockApp(tx: Executor, uuid: AppUuid): Promise<App | undefined> {
    const [app] = await tx
      .select()
      .from(appTable)
      .where(eq(appTable.uuid, uuid))
      .limit(1)
      .for('update')
    return app
  }

  // A redelivery of the commit already building or built must not build it twice.
  async isNewestBuildLive(tx: Executor, appUuid: AppUuid, commitSha: string): Promise<boolean> {
    const [newest] = await tx
      .select({ commitSha: buildTable.commitSha, status: buildTable.status })
      .from(buildTable)
      .where(eq(buildTable.appUuid, appUuid))
      .orderBy(desc(buildTable.uuid))
      .limit(1)
    return (
      newest?.commitSha === commitSha &&
      [BuildStatus.Running, BuildStatus.Succeeded].includes(newest.status)
    )
  }
}
