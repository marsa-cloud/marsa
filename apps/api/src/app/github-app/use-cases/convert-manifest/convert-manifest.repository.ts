import { EntityManager, UniqueConstraintViolationException } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'
import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'

/**
 * Persistence for the convert-manifest use-case (AgDR-0011). Wraps a forked EM
 * for request isolation; the use-case depends on this, not the raw EM.
 */
@Injectable()
export class ConvertManifestRepository {
  constructor(private readonly em: EntityManager) {}

  /**
   * Insert the App, or update the existing row's mutable columns — idempotent on
   * `github_app_id` and race-safe via the UNIQUE constraint (a lost insert race
   * re-resolves as an update).
   */
  async upsertByGithubAppId(app: GitHubApp): Promise<void> {
    const em = this.em.fork()
    const columns = {
      slug: app.slug,
      name: app.name,
      htmlUrl: app.htmlUrl,
      ownerLogin: app.ownerLogin,
      clientId: app.clientId,
      clientSecretEnc: app.clientSecretEnc,
      webhookSecretEnc: app.webhookSecretEnc,
      privateKeyPemEnc: app.privateKeyPemEnc,
    }

    const existing = await em.findOne(GitHubApp, { githubAppId: app.githubAppId })
    if (existing) {
      em.assign(existing, columns)
      await em.flush()
      return
    }

    try {
      await em.persistAndFlush(app)
    } catch (error) {
      if (!(error instanceof UniqueConstraintViolationException)) {
        throw error
      }
      em.clear()
      em.assign(await em.findOneOrFail(GitHubApp, { githubAppId: app.githubAppId }), columns)
      await em.flush()
    }
  }
}
