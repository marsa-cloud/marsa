import { Injectable, NotFoundException } from '@nestjs/common'
import type { App } from '#src/app/app-management/entities/app.table.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { ReleaseTrigger } from '#src/app/release/enums/release-trigger.enum.js'
import { ApplyReleaseService } from '#src/app/release/services/apply-release/apply-release.service.js'
import { RedeployAppRepository } from '#src/app/release/use-cases/redeploy-app/redeploy-app.repository.js'
import { RedeployAppResponse } from '#src/app/release/use-cases/redeploy-app/redeploy-app.response.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { RegistryCredentials } from '#src/modules/kubernetes/deploy-backend.types.js'

/**
 * Re-runs the app's current stored config as a new Release. Config is read
 * server-side rather than resubmitted, so pull credentials never round-trip
 * through the browser.
 *
 * Redeploy is not rollback: a Release records only its image ref, so this
 * always deploys the app as it is configured *now*. Deploying a historical
 * release needs the Release-as-snapshot model in #179.
 */
@Injectable()
export class RedeployAppUseCase {
  constructor(
    private readonly repository: RedeployAppRepository,
    private readonly applyRelease: ApplyReleaseService,
    private readonly cipher: SecretCipherService,
  ) {}

  async execute(slug: string): Promise<RedeployAppResponse> {
    const app = await this.repository.findAppBySlug(slug)
    if (!app) {
      throw new NotFoundException(`No app with slug '${slug}'.`)
    }

    const release = new ReleaseBuilder()
      .withApp(app)
      .withImageRef(app.image)
      .withTriggeredBy(ReleaseTrigger.Manual)
      .withDeployStatus(DeployStatus.Pending)
      .build()

    await this.repository.createRelease(release)

    try {
      await this.applyRelease.apply(app, release, this.readCredentials(app))
    } catch (error) {
      await this.repository.setReleaseDeployStatus(release.uuid, DeployStatus.Failed)
      throw error
    }

    return new RedeployAppResponse(app, release, this.applyRelease.baseDomain)
  }

  private readCredentials(app: App): RegistryCredentials | undefined {
    if (!app.imagePullCredentialsEnc) return undefined
    return JSON.parse(this.cipher.decrypt(app.imagePullCredentialsEnc)) as RegistryCredentials
  }
}
