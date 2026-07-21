import { Enum, type EnumOptions } from '@mikro-orm/core'
import { pgEnum } from 'drizzle-orm/pg-core'
import type { Release } from '#src/app/deployments/entities/release.entity.js'

/**
 * What produced a Release. Only `Manual` is produced in v0.1; `Webhook` is
 * reserved so #21's git-build step is a new enum value, not a new column or
 * code path (AgDR-0015).
 */
export enum ReleaseTrigger {
  Manual = 'manual',
  Webhook = 'webhook',
}

export const releaseTriggerEnum = pgEnum('release_trigger_enum', ReleaseTrigger)

export function ReleaseTriggerEnum(options?: EnumOptions<Partial<Release>>) {
  return Enum({
    ...options,
    items: () => ReleaseTrigger,
    nativeEnumName: 'release_trigger_enum',
  })
}
