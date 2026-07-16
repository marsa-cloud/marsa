import { ref } from '@mikro-orm/core'
import { AppBuilder } from '#src/app/deployments/entities/app.builder.js'
import type { App } from '#src/app/deployments/entities/app.entity.js'
import { Release } from '#src/app/deployments/entities/release.entity.js'
import { DeployStatus } from '#src/app/deployments/enums/deploy-status.enum.js'
import { ReleaseTrigger } from '#src/app/deployments/enums/release-trigger.enum.js'

/** Fluent builder for {@link Release}; constructor seeds valid defaults so `new ReleaseBuilder().build()` is always usable. */
export class ReleaseBuilder {
  private readonly release: Release

  constructor() {
    this.release = new Release()
    this.release.app = ref(new AppBuilder().build())
    this.release.imageRef = 'nginx:1.27'
    this.release.triggeredBy = ReleaseTrigger.Manual
    this.release.deployStatus = DeployStatus.Pending
  }

  withApp(app: App): this {
    this.release.app = ref(app)
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
