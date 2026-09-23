import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { Build } from '#src/app/build/entities/build.table.js'
import type { BuildUuid } from '#src/app/build/entities/build.uuid.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import { generateUuid } from '#src/utils/uuid.js'

export class BuildBuilder {
  private readonly build_: Build

  constructor() {
    const now = new Date()
    this.build_ = {
      uuid: generateUuid<BuildUuid>(),
      appUuid: new AppBuilder().build().uuid,
      commitSha: 'a'.repeat(40),
      branch: 'main',
      status: BuildStatus.Running,
      trigger: BuildTrigger.Manual,
      imageRef: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    }
  }

  withApp(app: App): this {
    this.build_.appUuid = app.uuid
    return this
  }

  withCommitSha(commitSha: string): this {
    this.build_.commitSha = commitSha
    return this
  }

  withStatus(status: BuildStatus): this {
    this.build_.status = status
    return this
  }

  withTrigger(trigger: BuildTrigger): this {
    this.build_.trigger = trigger
    return this
  }

  withImageRef(imageRef: string | null): this {
    this.build_.imageRef = imageRef
    return this
  }

  withFailureReason(failureReason: string | null): this {
    this.build_.failureReason = failureReason
    return this
  }

  withCreatedAt(createdAt: Date): this {
    this.build_.createdAt = createdAt
    return this
  }

  build(): Build {
    return this.build_
  }
}
