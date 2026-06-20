import { EntityManager } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'

import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import type { GitHubAppUuid } from '#src/app/github-app/entities/github-app.uuid.js'
import { GitHubInstallationBuilder } from '#src/app/github-app/entities/github-installation.builder.js'
import { GitHubInstallation } from '#src/app/github-app/entities/github-installation.entity.js'

@Injectable()
export class CaptureInstallationRepository {
  constructor(private readonly em: EntityManager) {}

  async loadProvisionedApp(): Promise<GitHubApp | null> {
    return this.em.fork().findOne(GitHubApp, {}, { orderBy: { createdAt: 'DESC' } })
  }

  async upsertByInstallationId(
    installationId: string,
    appUuid: GitHubAppUuid,
  ): Promise<GitHubInstallation> {
    const em = this.em.fork()
    const installation = new GitHubInstallationBuilder()
      .withInstallationId(installationId)
      .withApp(em.getReference(GitHubApp, appUuid, { wrapped: true }))
      .build()

    return em.upsert(installation, undefined, { onConflictFields: ['installationId'] })
  }
}
