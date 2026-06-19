import { EntityManager } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'

import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import { GitHubInstallationBuilder } from '#src/app/github-app/entities/github-installation.builder.js'
import { GitHubInstallation } from '#src/app/github-app/entities/github-installation.entity.js'
import type { Uuid } from '#src/utils/uuid.js'

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
   * Upsert the installation by `installationId` — atomic via MikroORM's native
   * INSERT ... ON CONFLICT, so no findOne-then-write race window. The App
   * relation is set from a reference so we don't reload it. `accountLogin` is
   * left untouched here; #61 enriches it.
   */
  async upsertByInstallationId(installationId: string, appUuid: Uuid): Promise<GitHubInstallation> {
    const em = this.em.fork()
    const installation = new GitHubInstallationBuilder()
      .withInstallationId(installationId)
      .withApp(em.getReference(GitHubApp, appUuid, { wrapped: true }))
      .build()

    // The builder's `uuid` is real but irrelevant on conflict — `onConflictFields`
    // pins the conflict target to `installationId` so a repeat capture updates
    // the existing row instead of racing on the PK.
    return em.upsert(installation, undefined, { onConflictFields: ['installationId'] })
  }
}
