import { EntityManager, ref, UniqueConstraintViolationException } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'

import { App } from '#src/app/deployments/entities/app.entity.js'
import { Release } from '#src/app/deployments/entities/release.entity.js'
import type { ReleaseUuid } from '#src/app/deployments/entities/release.uuid.js'
import type { ReleaseStatus } from '#src/app/deployments/enums/release-status.enum.js'

/**
 * Persistence for the deploy-app use-case (AgDR-0011). Wraps a forked EM for
 * request isolation; the use-case depends on this, not the raw EM.
 */
@Injectable()
export class DeployAppRepository {
  constructor(private readonly em: EntityManager) {}

  /**
   * Upsert the App by `slug` (idempotent, race-safe via the UNIQUE constraint),
   * then insert a Release pointing at the resolved App row.
   */
  async upsertAppAndCreateRelease(app: App, release: Release): Promise<void> {
    const em = this.em.fork()
    const target = await this.upsertApp(em, app)
    release.app = ref(target)
    await em.persistAndFlush(release)
  }

  /** Persist the rollout-derived status onto an existing Release (AgDR-0029). */
  async setReleaseStatus(uuid: ReleaseUuid, status: ReleaseStatus): Promise<void> {
    const em = this.em.fork()
    const release = await em.findOneOrFail(Release, { uuid })
    release.status = status
    await em.flush()
  }

  private async upsertApp(em: EntityManager, app: App): Promise<App> {
    const columns = {
      image: app.image,
      containerPort: app.containerPort,
      replicas: app.replicas,
      env: app.env,
      domain: app.domain,
      imagePullCredentialsEnc: app.imagePullCredentialsEnc ?? null,
    }

    const existing = await em.findOne(App, { slug: app.slug })
    if (existing) {
      em.assign(existing, columns)
      await em.flush()
      return existing
    }

    try {
      await em.persistAndFlush(app)
      return app
    } catch (error) {
      if (!(error instanceof UniqueConstraintViolationException)) {
        throw error
      }
      // Lost the insert race — re-resolve as an update on the winning row.
      em.clear()
      const winner = await em.findOneOrFail(App, { slug: app.slug })
      em.assign(winner, columns)
      await em.flush()
      return winner
    }
  }
}
