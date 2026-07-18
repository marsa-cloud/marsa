import { type EntityRepository } from '@mikro-orm/core'
import { InjectRepository } from '@mikro-orm/nestjs'
import { Injectable } from '@nestjs/common'
import { App } from '#src/app/app-management/entities/app.entity.js'

@Injectable()
export class ListAppsRepository {
  constructor(@InjectRepository(App) private readonly apps: EntityRepository<App>) {}

  /** All apps, newest first. */
  async listApps(): Promise<App[]> {
    return this.apps.findAll({ orderBy: { createdAt: 'DESC' } })
  }
}
