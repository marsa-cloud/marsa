import { Injectable, NotFoundException } from '@nestjs/common'
import { DEFAULT_TAIL_LINES } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.constants.js'
import { ViewAppLogsRepository } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.repository.js'
import { ViewAppLogsResponse } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.response.js'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'

@Injectable()
export class ViewAppLogsUseCase {
  constructor(
    private readonly repository: ViewAppLogsRepository,
    private readonly deployBackend: DeployBackend,
  ) {}

  async execute(slug: string, tailLines?: number): Promise<ViewAppLogsResponse> {
    const placement = await this.repository.findBySlug(slug)
    if (!placement) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }
    const logs = await this.deployBackend.readRunLogs(
      namespaceOf(placement.project, placement.environment),
      slug,
      { tailLines: tailLines ?? DEFAULT_TAIL_LINES },
    )
    return new ViewAppLogsResponse(logs)
  }
}
