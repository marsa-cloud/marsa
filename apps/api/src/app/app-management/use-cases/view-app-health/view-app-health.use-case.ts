import { Injectable } from '@nestjs/common'
import {
  AppHealthStatus,
  ViewAppHealthResponse,
} from '#src/app/app-management/use-cases/view-app-health/view-app-health.response.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import type { AppHealth } from '#src/modules/kubernetes/deploy-backend.types.js'

function verdict(health: AppHealth): AppHealthStatus {
  if (!health.found) {
    return AppHealthStatus.NotFound
  }
  if (health.desiredReplicas > 0 && health.availableReplicas >= health.desiredReplicas) {
    return AppHealthStatus.Healthy
  }
  if (health.availableReplicas > 0) {
    return AppHealthStatus.Degraded
  }
  return AppHealthStatus.Unavailable
}

@Injectable()
export class ViewAppHealthUseCase {
  constructor(private readonly deployBackend: DeployBackend) {}

  async execute(slug: string): Promise<ViewAppHealthResponse> {
    const health = await this.deployBackend.readAppHealth(OPERATOR_APPS_NAMESPACE, slug)
    return new ViewAppHealthResponse(verdict(health), health)
  }
}
