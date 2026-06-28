import { Enum, type EnumOptions } from '@mikro-orm/core'

import type { Release } from '#src/app/deployments/entities/release.entity.js'

/**
 * Lifecycle of a single deploy. The value is derived from an injectable status
 * source in the deploy use-case (#100, AgDR-0029), not set arbitrarily — this
 * enum just defines the allowed states. New rows start at `Pending`.
 */
export enum ReleaseStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Succeeded = 'succeeded',
  Failed = 'failed',
}

export function ReleaseStatusEnum(options?: EnumOptions<Partial<Release>>) {
  return Enum({
    ...options,
    items: () => ReleaseStatus,
    nativeEnumName: 'release_status_enum',
  })
}
