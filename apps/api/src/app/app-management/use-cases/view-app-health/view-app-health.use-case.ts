import { Injectable } from '@nestjs/common'
import { ViewAppHealthRepository } from '#src/app/app-management/use-cases/view-app-health/view-app-health.repository.js'
import {
  AppHealthStatus,
  ViewAppHealthResponse,
} from '#src/app/app-management/use-cases/view-app-health/view-app-health.response.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import type { AppHealth } from '#src/modules/kubernetes/deploy-backend.types.js'

function verdict(health: AppHealth, minReplicas: number): AppHealthStatus {
  if (!health.found) {
    return AppHealthStatus.NotFound
  }
  // Ahead of the arms below: a scale-to-zero app asleep at 0 pods is idle by
  // design, not unavailable (AgDR-0043).
  if (minReplicas === 0 && health.desiredReplicas === 0 && health.availableReplicas === 0) {
    return AppHealthStatus.Idle
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
  constructor(
    private readonly repository: ViewAppHealthRepository,
    private readonly deployBackend: DeployBackend,
  ) {}

  async execute(slug: string): Promise<ViewAppHealthResponse> {
    const app = await this.repository.findBySlug(slug)
    const health = await this.deployBackend.readAppHealth(OPERATOR_APPS_NAMESPACE, slug)
    return new ViewAppHealthResponse(verdict(health, app?.minReplicas ?? 1), health)
  }
}
