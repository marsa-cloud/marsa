import { Injectable } from '@nestjs/common'

import { GetAppDeployEventsResponse } from '#src/app/deployments/use-cases/get-app-deploy-events/get-app-deploy-events.response.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'

/** Newest-first cap on rollout events returned to the client (#115). */
export const MAX_DEPLOY_EVENTS = 50

@Injectable()
export class GetAppDeployEventsUseCase {
  constructor(private readonly deployBackend: DeployBackend) {}

  async execute(slug: string): Promise<GetAppDeployEventsResponse> {
    const events = await this.deployBackend.readDeployEvents(OPERATOR_APPS_NAMESPACE, slug)
    const newestFirst = [...events]
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
      .slice(0, MAX_DEPLOY_EVENTS)
    return new GetAppDeployEventsResponse(newestFirst)
  }
}
