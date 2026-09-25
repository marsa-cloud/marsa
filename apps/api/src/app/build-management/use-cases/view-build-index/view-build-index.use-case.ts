import { Injectable } from '@nestjs/common'
import { ViewBuildIndexQuery } from '#src/app/build-management/use-cases/view-build-index/query/view-build-index.query.js'
import { ViewBuildIndexRepository } from '#src/app/build-management/use-cases/view-build-index/view-build-index.repository.js'
import { ViewBuildIndexResponse } from '#src/app/build-management/use-cases/view-build-index/view-build-index.response.js'
import { keysetLimit } from '#src/utils/pagination/pagination-mapper.js'

@Injectable()
export class ViewBuildIndexUseCase {
  constructor(private readonly repository: ViewBuildIndexRepository) {}

  async execute(slug: string, query: ViewBuildIndexQuery): Promise<ViewBuildIndexResponse> {
    const builds = await this.repository.findByAppSlug(
      slug,
      keysetLimit(query.pagination),
      query.pagination?.key?.uuid,
    )
    return new ViewBuildIndexResponse(builds)
  }
}
