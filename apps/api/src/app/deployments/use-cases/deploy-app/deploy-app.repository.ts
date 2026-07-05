import { type EntityRepository } from '@mikro-orm/core'
import { InjectRepository } from '@mikro-orm/nestjs'
import { Injectable } from '@nestjs/common'

import { App } from '#src/app/deployments/entities/app.entity.js'
import { Release } from '#src/app/deployments/entities/release.entity.js'
import type { ReleaseUuid } from '#src/app/deployments/entities/release.uuid.js'
import type { DeployStatus } from '#src/app/deployments/enums/deploy-status.enum.js'

@Injectable()
export class DeployAppRepository {
  constructor(
    @InjectRepository(App) private readonly apps: EntityRepository<App>,
    @InjectRepository(Release) private readonly releases: EntityRepository<Release>,
  ) {}

  // First-deploy only: no slug conflict, so the in-memory `app.uuid` is the
  // persisted identity. Re-deploy (a slug conflict) keeps the DB's original
  // `uuid` via onConflictExcludeFields — at which point the caller must bind
  // the Release to the persisted App identity, not the freshly generated one,
  // to avoid an app_uuid FK mismatch. Deferred until re-deploy is implemented.
  async upsertApp(app: App): Promise<void> {
    await this.apps.upsert(app, {
      onConflictFields: ['slug'],
      onConflictExcludeFields: ['uuid', 'createdAt'],
    })
  }

  async createRelease(release: Release): Promise<void> {
    await this.releases.insert(release)
  }

  async setReleaseDeployStatus(uuid: ReleaseUuid, deployStatus: DeployStatus): Promise<void> {
    await this.releases.nativeUpdate({ uuid }, { deployStatus })
  }
}
