import { Injectable, NotFoundException } from '@nestjs/common'
import { ViewEnvironmentIndexQuery } from '#src/app/environment/use-cases/view-environment-index/query/view-environment-index.query.js'
import { ViewEnvironmentIndexRepository } from '#src/app/environment/use-cases/view-environment-index/view-environment-index.repository.js'
import { ViewEnvironmentIndexResponse } from '#src/app/environment/use-cases/view-environment-index/view-environment-index.response.js'
import { keysetLimit } from '#src/utils/pagination/pagination-mapper.js'

@Injectable()
export class ViewEnvironmentIndexUseCase {
  constructor(private readonly repository: ViewEnvironmentIndexRepository) {}

  async execute(
    projectSlug: string,
    query: ViewEnvironmentIndexQuery,
  ): Promise<ViewEnvironmentIndexResponse> {
    const project = await this.repository.findProjectBySlug(projectSlug)
    if (!project) {
      throw new NotFoundException(`Project '${projectSlug}' was not found.`)
    }
    const environments = await this.repository.listEnvironments(
      project.uuid,
      keysetLimit(query.pagination),
      query.pagination?.key?.uuid,
    )
    return new ViewEnvironmentIndexResponse(project, environments)
  }
}
