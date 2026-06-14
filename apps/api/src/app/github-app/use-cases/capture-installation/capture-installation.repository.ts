import { EntityManager, UniqueConstraintViolationException } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'

import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { GitHubInstallationBuilder } from '#src/app/github-app/entities/github-installation.builder.js'
import { GitHubInstallation } from '#src/app/github-app/entities/github-installation.entity.js'

/**
 * Persistence for the capture-installation use-case (AgDR-0011 pattern). Wraps a
 * forked EM for request isolation; the use-case depends on this, not the raw EM.
 */
@Injectable()
export class CaptureInstallationRepository {
  constructor(private readonly em: EntityManager) {}

  /**
   * The single provisioned App for this install (self-hosted = one row). Returns
   * the most recently created if more than one ever exists; null if none.
   */
  async loadProvisionedApp(): Promise<GitHubApp | null> {
    return this.em.fork().findOne(GitHubApp, {}, { orderBy: { createdAt: 'DESC' } })
  }

  /**
   * Insert the installation, or no-op if it already exists — idempotent on
   * `installation_id` and race-safe via the UNIQUE constraint (a lost insert race
   * re-resolves to the existing row). The App relation is set from a reference so
   * we don't reload it. `accountLogin` is left untouched here; #61 enriches it.
   */
  async upsertByInstallationId(
    installationId: string,
    appUuid: string,
  ): Promise<GitHubInstallation> {
    const em = this.em.fork()

    const existing = await em.findOne(GitHubInstallation, { installationId })
    if (existing) {
      return existing
    }

    const installation = new GitHubInstallationBuilder()
      .withInstallationId(installationId)
      .withApp(em.getReference(GitHubApp, appUuid, { wrapped: true }))
      .build()

    try {
      await em.persistAndFlush(installation)
      return installation
    } catch (error) {
      if (!(error instanceof UniqueConstraintViolationException)) {
        throw error
      }
      em.clear()
      return em.findOneOrFail(GitHubInstallation, { installationId })
    }
  }
}
