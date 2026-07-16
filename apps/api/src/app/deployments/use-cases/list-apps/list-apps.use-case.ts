import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ListAppsRepository } from '#src/app/deployments/use-cases/list-apps/list-apps.repository.js'
import { ListAppsResponse } from '#src/app/deployments/use-cases/list-apps/list-apps.response.js'

@Injectable()
export class ListAppsUseCase {
  constructor(
    private readonly repository: ListAppsRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(): Promise<ListAppsResponse> {
    const baseDomain = this.config.getOrThrow<string>('MARSA_BASE_DOMAIN')
    const apps = await this.repository.listApps()
    return new ListAppsResponse(apps, baseDomain)
  }
}
