import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ViewAppIndexQuery } from '#src/app/app-management/use-cases/view-app-index/query/view-app-index.query.js'
import { ViewAppIndexRepository } from '#src/app/app-management/use-cases/view-app-index/view-app-index.repository.js'
import { ViewAppIndexResponse } from '#src/app/app-management/use-cases/view-app-index/view-app-index.response.js'
import { keysetLimit } from '#src/utils/pagination/pagination-mapper.js'

@Injectable()
export class ViewAppIndexUseCase {
  constructor(
    private readonly repository: ViewAppIndexRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(query: ViewAppIndexQuery): Promise<ViewAppIndexResponse> {
    const baseDomain = this.config.getOrThrow<string>('MARSA_BASE_DOMAIN')
    const apps = await this.repository.listApps(
      keysetLimit(query.pagination),
      query.pagination?.key?.uuid,
    )
    return new ViewAppIndexResponse(apps, baseDomain)
  }
}
