import { ApiProperty } from '@nestjs/swagger'
import type { AppHealth } from '#src/modules/kubernetes/deploy-backend.types.js'

/** Live runtime-health verdict for an app (#100) — derived, never stored. */
export enum AppHealthStatus {
  Healthy = 'healthy',
  Degraded = 'degraded',
  Unavailable = 'unavailable',
  NotFound = 'not_found',
}

export class ViewAppHealthResponse {
  @ApiProperty({
    enum: AppHealthStatus,
    enumName: 'AppHealthStatus',
    example: AppHealthStatus.Healthy,
  })
  readonly status: AppHealthStatus

  @ApiProperty({ type: Number, example: 1 })
  readonly availableReplicas: number

  @ApiProperty({ type: Number, example: 1 })
  readonly desiredReplicas: number

  constructor(status: AppHealthStatus, health: AppHealth) {
    this.status = status
    this.availableReplicas = health.availableReplicas
    this.desiredReplicas = health.desiredReplicas
  }
}
