import { Injectable } from '@nestjs/common'
import { ViewProjectIndexQuery } from '#src/app/project/use-cases/view-project-index/query/view-project-index.query.js'
import { ViewProjectIndexRepository } from '#src/app/project/use-cases/view-project-index/view-project-index.repository.js'
import { ViewProjectIndexResponse } from '#src/app/project/use-cases/view-project-index/view-project-index.response.js'
import { keysetLimit } from '#src/utils/pagination/pagination-mapper.js'

@Injectable()
export class ViewProjectIndexUseCase {
  constructor(private readonly repository: ViewProjectIndexRepository) {}

  async execute(query: ViewProjectIndexQuery): Promise<ViewProjectIndexResponse> {
    const projects = await this.repository.listProjects(
      keysetLimit(query.pagination),
      query.pagination?.key?.uuid,
    )
    return new ViewProjectIndexResponse(projects)
  }
}
