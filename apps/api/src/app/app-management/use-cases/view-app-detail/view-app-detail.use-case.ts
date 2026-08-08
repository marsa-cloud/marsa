import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ViewAppDetailRepository } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.repository.js'
import { ViewAppDetailResponse } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.response.js'

@Injectable()
export class ViewAppDetailUseCase {
  constructor(
    private readonly repository: ViewAppDetailRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(slug: string): Promise<ViewAppDetailResponse> {
    const app = await this.repository.findBySlug(slug)
    if (!app) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }

    return new ViewAppDetailResponse(app, this.config.getOrThrow<string>('MARSA_BASE_DOMAIN'))
  }
}
