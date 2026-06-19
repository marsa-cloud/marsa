import { EntityManager } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'

import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { UserBuilder } from '#src/app/user/entities/user.builder.js'
import { User } from '#src/app/user/entities/user.entity.js'

/**
 * Persistence for the complete-github-login use-case (AgDR-0011 pattern). Wraps
 * a forked EM for request isolation; the use-case depends on this, not the raw EM.
 */
@Injectable()
export class CompleteGithubLoginRepository {
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

  /**
   * Upsert the user by `githubUserId` — atomic via MikroORM's native
   * INSERT ... ON CONFLICT, so no findOne-then-write race window. The GitHub
   * login is refreshed on every login in case the user renamed it.
   */
  async upsertByGithubUserId(githubUserId: string, githubLogin: string): Promise<User> {
    const em = this.em.fork()
    const user = new UserBuilder()
      .withGithubUserId(githubUserId)
      .withGithubLogin(githubLogin)
      .build()

    // The builder's `uuid` is real but irrelevant on conflict — `onConflictFields`
    // pins the conflict target to `githubUserId` so a second login for the same
    // GitHub user updates the existing row instead of racing on the PK.
    return em.upsert(user, undefined, { onConflictFields: ['githubUserId'] })
  }
}
