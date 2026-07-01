import { type EntityRepository } from '@mikro-orm/core'
import { InjectRepository } from '@mikro-orm/nestjs'
import { Injectable } from '@nestjs/common'

import { App } from '#src/app/deployments/entities/app.entity.js'
import { Release } from '#src/app/deployments/entities/release.entity.js'
import type { ReleaseUuid } from '#src/app/deployments/entities/release.uuid.js'
import type { ReleaseStatus } from '#src/app/deployments/enums/release-status.enum.js'

@Injectable()
export class DeployAppRepository {
  constructor(
    @InjectRepository(App) private readonly apps: EntityRepository<App>,
    @InjectRepository(Release) private readonly releases: EntityRepository<Release>,
  ) {}

  async upsertApp(app: App): Promise<void> {
    await this.apps.upsert(app, {
      onConflictFields: ['slug'],
      onConflictExcludeFields: ['uuid', 'createdAt'],
    })
  }

  async createRelease(release: Release): Promise<void> {
    await this.releases.insert(release)
  }

  async setReleaseStatus(uuid: ReleaseUuid, status: ReleaseStatus): Promise<void> {
    await this.releases.nativeUpdate({ uuid }, { status })
  }
}
