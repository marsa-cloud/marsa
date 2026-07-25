import { pgEnum } from 'drizzle-orm/pg-core'

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
