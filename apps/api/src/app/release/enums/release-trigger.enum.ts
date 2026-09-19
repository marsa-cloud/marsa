import { pgEnum } from 'drizzle-orm/pg-core'

// `Webhook` is reserved for #21's git build (AgDR-0015).
export enum ReleaseTrigger {
  Manual = 'manual',
  Webhook = 'webhook',
  Rollback = 'rollback',
}

export const releaseTriggerEnum = pgEnum('release_trigger_enum', ReleaseTrigger)
