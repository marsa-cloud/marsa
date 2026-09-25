import { pgEnum } from 'drizzle-orm/pg-core'

export enum BuildTrigger {
  Push = 'push',
  Create = 'create',
  Manual = 'manual',
}

export const buildTriggerEnum = pgEnum('build_trigger_enum', BuildTrigger)
