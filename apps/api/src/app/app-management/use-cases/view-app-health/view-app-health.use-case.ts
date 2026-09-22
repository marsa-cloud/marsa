import { Injectable, NotFoundException } from '@nestjs/common'
import { appRefOf } from '#src/app/app-management/queries/app-placement.js'
import { ViewAppHealthRepository } from '#src/app/app-management/use-cases/view-app-health/view-app-health.repository.js'
import {
  AppHealthStatus,
  ViewAppHealthResponse,
} from '#src/app/app-management/use-cases/view-app-health/view-app-health.response.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import type { AppHealth } from '#src/modules/runtime/runtime.types.js'

function verdict(health: AppHealth, minReplicas: number): AppHealthStatus {
  if (!health.found) {
    return AppHealthStatus.NotFound
  }
  // Ahead of the arms below: a scale-to-zero app asleep at 0 pods is idle by
  // design, not unavailable (AgDR-0043). availableReplicas is deliberately not
  // checked — a pod still draining is counted there, and would fall through to
  // Degraded for the length of its shutdown.
  if (minReplicas === 0 && health.desiredReplicas === 0) {
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
    private readonly appRuntime: AppRuntime,
  ) {}

  async execute(slug: string): Promise<ViewAppHealthResponse> {
    const placement = await this.repository.findBySlug(slug)
    if (!placement) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }
    const health = await this.appRuntime.readHealth(appRefOf(placement))
    return new ViewAppHealthResponse(verdict(health, placement.app.minReplicas), health)
  }
}
