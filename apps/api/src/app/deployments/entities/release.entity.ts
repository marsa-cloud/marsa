import { Entity, ManyToOne, PrimaryKey, Property, type Ref } from '@mikro-orm/core'
import { App } from '#src/app/deployments/entities/app.entity.js'
import type { ReleaseUuid } from '#src/app/deployments/entities/release.uuid.js'
import { DeployStatus, DeployStatusEnum } from '#src/app/deployments/enums/deploy-status.enum.js'
import {
  ReleaseTrigger,
  ReleaseTriggerEnum,
} from '#src/app/deployments/enums/release-trigger.enum.js'
import { generateUuid } from '#src/utils/uuid.js'

/**
 * One row per deploy event for an App. Decouples "how we got an image ref" from
 * "deploying it" (AgDR-0015): #21's build step becomes a new `triggeredBy` value
 * producing a Release, not a new deploy path. `imageRef` is the fully-qualified
 * image (registry/repo:tag or @digest) being rolled out.
 */
@Entity({ tableName: 'release' })
export class Release {
  @PrimaryKey({ type: 'uuid' })
  uuid: ReleaseUuid = generateUuid<ReleaseUuid>()

  @ManyToOne(() => App, { nullable: false, ref: true })
  app!: Ref<App>

  @Property({ type: 'string', length: 255 })
  imageRef!: string

  @ReleaseTriggerEnum({ default: ReleaseTrigger.Manual })
  triggeredBy: ReleaseTrigger = ReleaseTrigger.Manual

  @DeployStatusEnum({ default: DeployStatus.Pending })
  deployStatus: DeployStatus = DeployStatus.Pending

  @Property({ type: 'datetime' })
  createdAt: Date = new Date()

  @Property({ type: 'datetime', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
