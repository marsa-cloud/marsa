import { type EntityRepository } from '@mikro-orm/core'
import { InjectRepository } from '@mikro-orm/nestjs'
import { Injectable } from '@nestjs/common'

import { App } from '#src/app/deployments/entities/app.entity.js'
import { Release } from '#src/app/deployments/entities/release.entity.js'

export interface AppWithLatestRelease {
  app: App
  latestRelease: Release | null
}

@Injectable()
export class ListAppsRepository {
  constructor(
    @InjectRepository(App) private readonly apps: EntityRepository<App>,
    @InjectRepository(Release) private readonly releases: EntityRepository<Release>,
  ) {}

  /**
   * All apps (newest first), each paired with its newest Release. Two queries,
   * no N+1: fetch every app, then every release ordered `createdAt DESC` and
   * keep the first one seen per app uuid.
   */
  async listAppsWithLatestRelease(): Promise<AppWithLatestRelease[]> {
    const apps = await this.apps.findAll({ orderBy: { createdAt: 'DESC' } })
    if (apps.length === 0) return []

    const releases = await this.releases.find(
      { app: { $in: apps.map((app) => app.uuid) } },
      { orderBy: { createdAt: 'DESC' } },
    )

    const latestByApp = new Map<string, Release>()
    for (const release of releases) {
      const appUuid = release.app.unwrap().uuid
      if (!latestByApp.has(appUuid)) latestByApp.set(appUuid, release)
    }

    return apps.map((app) => ({ app, latestRelease: latestByApp.get(app.uuid) ?? null }))
  }
}
