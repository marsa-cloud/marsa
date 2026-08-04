import { Injectable } from '@nestjs/common'
import { type GitHubApp } from '#src/app/github-app/entities/github-app.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

/**
 * Persistence for the begin-github-login use-case (AgDR-0011 pattern). The
 * use-case depends on this, not the raw db handle.
 */
@Injectable()
export class BeginGithubLoginRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  /**
   * The single provisioned App for this install (self-hosted = one row). Returns
   * the most recently created if more than one ever exists; null if none.
   */
  async loadProvisionedApp(): Promise<GitHubApp | null> {
    const app = await this.db.query.githubAppTable.findFirst({
      orderBy: { createdAt: 'desc' },
    })
    return app ?? null
  }
}
