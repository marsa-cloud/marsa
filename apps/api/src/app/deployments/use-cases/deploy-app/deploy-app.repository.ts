import { type EntityRepository, ref } from '@mikro-orm/core'
import { InjectRepository } from '@mikro-orm/nestjs'
import { Injectable } from '@nestjs/common'

import { App } from '#src/app/deployments/entities/app.entity.js'
import { Release } from '#src/app/deployments/entities/release.entity.js'
import type { ReleaseUuid } from '#src/app/deployments/entities/release.uuid.js'
import type { ReleaseStatus } from '#src/app/deployments/enums/release-status.enum.js'

/**
 * Persistence for the deploy-app use-case. Injects entity repositories and lets
 * MikroORM manage the Unit of Work — no manual `em.fork()` (Rex #103,
 * r3503774398).
 */
@Injectable()
export class DeployAppRepository {
  constructor(
    @InjectRepository(App) private readonly apps: EntityRepository<App>,
    @InjectRepository(Release) private readonly releases: EntityRepository<Release>,
  ) {}

  /**
   * Upsert the App by `slug` and insert its Release in one transaction, so a
   * Release never lands without its App (Rex #103, r3493223278). The native
   * upsert is race-safe via the `slug` UNIQUE constraint; insert-only columns
   * are kept on conflict.
   */
  async upsertAppAndCreateRelease(app: App, release: Release): Promise<void> {
    const em = this.apps.getEntityManager()
    await em.transactional(async (tx) => {
      const target = await tx.upsert(App, app, {
        onConflictFields: ['slug'],
        onConflictExcludeFields: ['uuid', 'createdAt'],
      })
      release.app = ref(target)
      tx.persist(release)
    })
  }

  /** Persist the rollout-derived status onto an existing Release. */
  async setReleaseStatus(uuid: ReleaseUuid, status: ReleaseStatus): Promise<void> {
    const release = await this.releases.findOneOrFail({ uuid })
    release.status = status
    await this.releases.getEntityManager().flush()
  }
}
