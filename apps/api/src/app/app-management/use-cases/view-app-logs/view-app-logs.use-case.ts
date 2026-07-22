import { Injectable } from '@nestjs/common'
import { DEFAULT_TAIL_LINES } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.constants.js'
import { ViewAppLogsResponse } from '#src/app/app-management/use-cases/view-app-logs/view-app-logs.response.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'

@Injectable()
export class ViewAppLogsUseCase {
  constructor(private readonly deployBackend: DeployBackend) {}

  async execute(slug: string, tailLines?: number): Promise<ViewAppLogsResponse> {
    const logs = await this.deployBackend.readRunLogs(OPERATOR_APPS_NAMESPACE, slug, {
      tailLines: tailLines ?? DEFAULT_TAIL_LINES,
    })
    return new ViewAppLogsResponse(logs)
  }
}
