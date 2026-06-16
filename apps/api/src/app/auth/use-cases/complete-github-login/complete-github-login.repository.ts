import { EntityManager, UniqueConstraintViolationException } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'

import { OperatorBuilder } from '#src/app/auth/entities/operator.builder.js'
import { Operator } from '#src/app/auth/entities/operator.entity.js'
import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'

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
   * Upsert the operator by `githubUserId`, idempotent and race-safe via the
   * UNIQUE constraint (a lost insert race re-resolves to the existing row,
   * mirroring `CaptureInstallationRepository.upsertByInstallationId`). The
   * GitHub login is refreshed on every login in case the user renamed it.
   */
  async upsertByGithubUserId(githubUserId: string, githubLogin: string): Promise<Operator> {
    const em = this.em.fork()

    const existing = await em.findOne(Operator, { githubUserId })
    if (existing) {
      existing.githubLogin = githubLogin
      await em.flush()
      return existing
    }

    const operator = new OperatorBuilder()
      .withGithubUserId(githubUserId)
      .withGithubLogin(githubLogin)
      .build()

    try {
      await em.persistAndFlush(operator)
      return operator
    } catch (error) {
      if (!(error instanceof UniqueConstraintViolationException)) {
        throw error
      }
      em.clear()
      return em.findOneOrFail(Operator, { githubUserId })
    }
  }
}
