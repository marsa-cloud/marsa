import { EntityManager } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'
import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'

/**
 * Persistence for the begin-github-login use-case (AgDR-0011 pattern). Wraps a
 * forked EM for request isolation; the use-case depends on this, not the raw EM.
 */
@Injectable()
export class BeginGithubLoginRepository {
  constructor(private readonly em: EntityManager) {}

  /**
   * The single provisioned App for this install (self-hosted = one row). Returns
   * the most recently created if more than one ever exists; null if none.
   */
  async loadProvisionedApp(): Promise<GitHubApp | null> {
    const [app] = await this.em
      .fork()
      .find(GitHubApp, {}, { orderBy: { createdAt: 'DESC' }, limit: 1 })
    return app ?? null
  }
}
