import { Enum, type EnumOptions } from '@mikro-orm/core'
import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'
import type { Release } from '#src/app/deployments/entities/release.entity.js'

/**
 * Lifecycle of a single deploy (rollout). The value is reconciled from a live
 * cluster read on the release-list endpoint (#100, AgDR-0034) — this enum just
 * defines the allowed states. New rows start at `Pending`. Build has its own
 * distinct lifecycle (`buildStatus`, #21), tracked by a separate enum.
 */
export enum DeployStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Succeeded = 'succeeded',
  Failed = 'failed',
}

export function DeployStatusEnum(options?: EnumOptions<Partial<Release>>) {
  return Enum({
    ...options,
    items: () => DeployStatus,
    nativeEnumName: 'deploy_status_enum',
  })
}

export const DeployStatusApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
  ApiProperty({
    ...options,
    enum: DeployStatus,
    enumName: 'DeployStatus',
  })
