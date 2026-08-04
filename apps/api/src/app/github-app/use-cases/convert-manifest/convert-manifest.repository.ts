import { Injectable } from '@nestjs/common'
import { type GitHubApp, githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ConvertManifestRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  /**
   * Insert the App, or update its mutable columns on a `github_app_id` conflict —
   * idempotent and race-safe via the UNIQUE constraint (a lost insert race
   * re-resolves as the conflict update).
   */
  async upsertByGithubAppId(app: GitHubApp): Promise<void> {
    await this.db
      .insert(githubAppTable)
      .values(app)
      .onConflictDoUpdate({
        target: githubAppTable.githubAppId,
        set: {
          slug: app.slug,
          name: app.name,
          htmlUrl: app.htmlUrl,
          ownerLogin: app.ownerLogin,
          clientId: app.clientId,
          clientSecretEnc: app.clientSecretEnc,
          webhookSecretEnc: app.webhookSecretEnc,
          privateKeyPemEnc: app.privateKeyPemEnc,
          updatedAt: app.updatedAt,
        },
      })
  }
}
