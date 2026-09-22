import { Injectable, NotFoundException } from '@nestjs/common'
import { ViewEnvironmentIndexRepository } from '#src/app/environment/use-cases/view-environment-index/view-environment-index.repository.js'
import { ViewEnvironmentIndexResponse } from '#src/app/environment/use-cases/view-environment-index/view-environment-index.response.js'

@Injectable()
export class ViewEnvironmentIndexUseCase {
  constructor(private readonly repository: ViewEnvironmentIndexRepository) {}

  async execute(projectSlug: string): Promise<ViewEnvironmentIndexResponse> {
    const project = await this.repository.findProjectBySlug(projectSlug)
    if (!project) {
      throw new NotFoundException(`Project '${projectSlug}' was not found.`)
    }
    return new ViewEnvironmentIndexResponse(
      project,
      await this.repository.listEnvironments(project.uuid),
    )
  }
}
