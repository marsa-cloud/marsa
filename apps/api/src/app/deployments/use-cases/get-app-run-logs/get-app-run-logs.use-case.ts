import { Injectable } from '@nestjs/common'
import { DEFAULT_TAIL_LINES } from '#src/app/deployments/use-cases/get-app-run-logs/get-app-run-logs.constants.js'
import { GetAppRunLogsResponse } from '#src/app/deployments/use-cases/get-app-run-logs/get-app-run-logs.response.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'

@Injectable()
export class GetAppRunLogsUseCase {
  constructor(private readonly deployBackend: DeployBackend) {}

  async execute(slug: string, tailLines?: number): Promise<GetAppRunLogsResponse> {
    const logs = await this.deployBackend.readRunLogs(OPERATOR_APPS_NAMESPACE, slug, {
      tailLines: tailLines ?? DEFAULT_TAIL_LINES,
    })
    return new GetAppRunLogsResponse(logs)
  }
}
