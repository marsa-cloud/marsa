import { Injectable, NotFoundException } from '@nestjs/common'
import { ViewDatabaseDetailRepository } from '#src/app/database-management/use-cases/view-database-detail/view-database-detail.repository.js'
import { ViewDatabaseDetailResponse } from '#src/app/database-management/use-cases/view-database-detail/view-database-detail.response.js'
import { DatabaseRuntime } from '#src/modules/runtime/database-runtime.js'

@Injectable()
export class ViewDatabaseDetailUseCase {
  constructor(
    private readonly repository: ViewDatabaseDetailRepository,
    private readonly runtime: DatabaseRuntime,
  ) {}

  async execute(slug: string): Promise<ViewDatabaseDetailResponse> {
    const placement = await this.repository.findPlacementBySlug(slug)
    if (!placement) {
      throw new NotFoundException(`Database '${slug}' was not found.`)
    }

    const status = await this.runtime.readStatus(placement)
    return new ViewDatabaseDetailResponse(placement, status)
  }
}
