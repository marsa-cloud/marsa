import { AppBuilder } from '#src/app/deployments/entities/app.builder.js'
import type { App } from '#src/app/deployments/entities/app.table.js'
import type { Release } from '#src/app/deployments/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/deployments/entities/release.uuid.js'
import { DeployStatus } from '#src/app/deployments/enums/deploy-status.enum.js'
import { ReleaseTrigger } from '#src/app/deployments/enums/release-trigger.enum.js'
import { generateUuid } from '#src/utils/uuid.js'

/** Fluent builder for {@link Release}; constructor seeds valid defaults so `new ReleaseBuilder().build()` is always usable. */
export class ReleaseBuilder {
  private readonly release: Release

  constructor() {
    const now = new Date()
    this.release = {
      uuid: generateUuid<ReleaseUuid>(),
      appUuid: new AppBuilder().build().uuid,
      imageRef: 'nginx:1.27',
      triggeredBy: ReleaseTrigger.Manual,
      deployStatus: DeployStatus.Pending,
      createdAt: now,
      updatedAt: now,
    }
  }

  withApp(app: App): this {
    this.release.appUuid = app.uuid
    return this
  }

  withImageRef(imageRef: string): this {
    this.release.imageRef = imageRef
    return this
  }

  withTriggeredBy(triggeredBy: ReleaseTrigger): this {
    this.release.triggeredBy = triggeredBy
    return this
  }

  withDeployStatus(deployStatus: DeployStatus): this {
    this.release.deployStatus = deployStatus
    return this
  }

  build(): Release {
    return this.release
  }
}
