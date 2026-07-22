import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ViewAppIndexRepository } from '#src/app/app-management/use-cases/view-app-index/view-app-index.repository.js'
import { ViewAppIndexResponse } from '#src/app/app-management/use-cases/view-app-index/view-app-index.response.js'

@Injectable()
export class ViewAppIndexUseCase {
  constructor(
    private readonly repository: ViewAppIndexRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(): Promise<ViewAppIndexResponse> {
    const baseDomain = this.config.getOrThrow<string>('MARSA_BASE_DOMAIN')
    const apps = await this.repository.listApps()
    return new ViewAppIndexResponse(apps, baseDomain)
  }
}
