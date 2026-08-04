import { Injectable } from '@nestjs/common'
import { type GitHubApp } from '#src/app/github-app/entities/github-app.table.js'
import type { GitHubAppUuid } from '#src/app/github-app/entities/github-app.uuid.js'
import { GitHubInstallationBuilder } from '#src/app/github-app/entities/github-installation.builder.js'
import {
  type GitHubInstallation,
  githubInstallationTable,
} from '#src/app/github-app/entities/github-installation.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class CaptureInstallationRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async loadProvisionedApp(): Promise<GitHubApp | null> {
    const app = await this.db.query.githubAppTable.findFirst({
      orderBy: { createdAt: 'desc' },
    })
    return app ?? null
  }

  async upsertByInstallationId(
    installationId: string,
    appUuid: GitHubAppUuid,
  ): Promise<GitHubInstallation> {
    const installation = new GitHubInstallationBuilder()
      .withInstallationId(installationId)
      .withAppUuid(appUuid)
      .build()

    const [row] = await this.db
      .insert(githubInstallationTable)
      .values(installation)
      .onConflictDoUpdate({
        target: githubInstallationTable.installationId,
        set: { appUuid: installation.appUuid, accountLogin: installation.accountLogin },
      })
      .returning()
    return row
  }
}
