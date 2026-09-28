import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import type { Build } from '#src/app/build-management/entities/build.table.js'
import type { BuildUuid } from '#src/app/build-management/entities/build.uuid.js'
import { BuildStatus } from '#src/app/build-management/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build-management/enums/build-trigger.enum.js'
import { BUILD_DISAPPEARED } from '#src/app/build-management/use-cases/complete-build/complete-build.constants.js'
import { CompleteBuildRepository } from '#src/app/build-management/use-cases/complete-build/complete-build.repository.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import { deploySpecOf } from '#src/app/release/entities/release-deploy-spec.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { ReleaseTrigger } from '#src/app/release/enums/release-trigger.enum.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import type { Database, Transaction } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'
import { BuildState } from '#src/modules/runtime/runtime.enums.js'
import { type BuildObservation } from '#src/modules/runtime/runtime.types.js'

@Injectable()
export class CompleteBuildUseCase {
  private readonly baseDomain: string

  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: CompleteBuildRepository,
    private readonly appRuntime: AppRuntime,
    private readonly imageRegistry: ImageRegistry,
    private readonly cipher: ImagePullCredentialsCipher,
    config: ConfigService,
  ) {
    this.baseDomain = config.getOrThrow<string>('MARSA_BASE_DOMAIN')
  }

  async execute(buildUuid: BuildUuid, observation: BuildObservation): Promise<void> {
    await this.db.transaction(async (tx) => {
      const build = await this.repository.claimRunning(tx, buildUuid)
      if (!build || observation.state === BuildState.Running) {
        return
      }
      if (observation.state === BuildState.Succeeded) {
        await this.release(tx, build)
        return
      }
      const failureReason =
        observation.state === BuildState.Failed ? observation.reason : BUILD_DISAPPEARED
      await this.repository.finish(tx, build.uuid, { status: BuildStatus.Failed, failureReason })
    })
  }

  private async release(tx: Transaction, build: Build): Promise<void> {
    const placement = await this.repository.findPlacement(tx, build.appUuid)
    if (!placement) {
      return
    }
    const imageRef = this.imageRegistry.imageRefFor(placement.app.slug, build.commitSha)
    await this.repository.finish(tx, build.uuid, { status: BuildStatus.Succeeded, imageRef })
    await this.repository.setAppImage(tx, placement.app.uuid, imageRef)
    const app = { ...placement.app, image: imageRef }
    const release = new ReleaseBuilder()
      .withApp(app)
      .withBuildUuid(build.uuid)
      .withTriggeredBy(
        build.trigger === BuildTrigger.Push ? ReleaseTrigger.Webhook : ReleaseTrigger.Manual,
      )
      .withDeployStatus(DeployStatus.Pending)
      .build()
    await this.repository.insertRelease(tx, release)
    try {
      await tx.transaction(() => this.deploy({ ...placement, app }, release))
    } catch {
      // The image is built and stored; only its rollout failed, which the release records.
      await this.repository.setReleaseDeployStatus(tx, release.uuid, DeployStatus.Failed)
    }
  }

  private async deploy(placement: AppPlacement, release: Release): Promise<void> {
    const credentials =
      this.imageRegistry.pullCredentialsFor(release.imageRef) ??
      this.cipher.openForApp(placement.app.slug, release.imagePullCredentialsEnc)
    const spec = deploySpecOf(placement, release, { baseDomain: this.baseDomain, credentials })
    await this.appRuntime.deploy(placement, spec)
  }
}
