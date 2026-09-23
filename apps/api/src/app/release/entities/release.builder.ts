import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { BuildUuid } from '#src/app/build/entities/build.uuid.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import { type ReleaseSnapshot, snapshotOf } from '#src/app/release/entities/release-snapshot.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { ReleaseTrigger } from '#src/app/release/enums/release-trigger.enum.js'
import { generateUuid } from '#src/utils/uuid.js'

/** Fluent builder for {@link Release}; constructor seeds valid defaults so `new ReleaseBuilder().build()` is always usable. */
export class ReleaseBuilder {
  private readonly release: Release

  constructor() {
    const now = new Date()
    const app = new AppBuilder().build()
    this.release = {
      uuid: generateUuid<ReleaseUuid>(),
      appUuid: app.uuid,
      ...snapshotOf(app),
      sourceReleaseUuid: null,
      buildUuid: null,
      triggeredBy: ReleaseTrigger.Manual,
      deployStatus: DeployStatus.Pending,
      createdAt: now,
      updatedAt: now,
    }
  }

  withApp(app: App): this {
    this.release.appUuid = app.uuid
    return this.withSnapshot(snapshotOf(app))
  }

  withSnapshot(snapshot: ReleaseSnapshot): this {
    this.release.imageRef = snapshot.imageRef
    this.release.env = snapshot.env
    this.release.containerPort = snapshot.containerPort
    this.release.minReplicas = snapshot.minReplicas
    this.release.maxReplicas = snapshot.maxReplicas
    this.release.imagePullCredentialsEnc = snapshot.imagePullCredentialsEnc
    return this
  }

  withImageRef(imageRef: string): this {
    this.release.imageRef = imageRef
    return this
  }

  withSourceReleaseUuid(sourceReleaseUuid: ReleaseUuid | null): this {
    this.release.sourceReleaseUuid = sourceReleaseUuid
    return this
  }

  withBuildUuid(buildUuid: BuildUuid | null): this {
    this.release.buildUuid = buildUuid
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
