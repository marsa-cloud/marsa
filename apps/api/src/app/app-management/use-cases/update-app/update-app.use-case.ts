import { Injectable, NotFoundException } from '@nestjs/common'
import type { App } from '#src/app/app-management/entities/app.table.js'
import { UpdateAppCommand } from '#src/app/app-management/use-cases/update-app/update-app.command.js'
import { UpdateAppRepository } from '#src/app/app-management/use-cases/update-app/update-app.repository.js'
import { UpdateAppResponse } from '#src/app/app-management/use-cases/update-app/update-app.response.js'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import { ApplyReleaseService } from '#src/app/release/services/apply-release/apply-release.service.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'

// Writes App, then re-applies when placement changed: a pin is location rather than config, so it
// never reaches a Release and hasUndeployedChanges structurally cannot see it.
@Injectable()
export class UpdateAppUseCase {
  constructor(
    private readonly repository: UpdateAppRepository,
    private readonly credentialsCipher: ImagePullCredentialsCipher,
    private readonly deployBackend: DeployBackend,
    private readonly applyRelease: ApplyReleaseService,
  ) {}

  async execute(slug: string, command: UpdateAppCommand): Promise<UpdateAppResponse> {
    const updated = await this.repository.updateBySlug(slug, {
      image: command.image,
      containerPort: command.containerPort,
      minReplicas: command.minReplicas,
      maxReplicas: command.maxReplicas,
      env: command.env,
      nodePin: command.nodePin,
      imagePullCredentialsEnc: this.credentialsEnc(command),
    })
    if (!updated) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }

    if (command.nodePin !== undefined) {
      await this.reapply(updated)
    }

    return new UpdateAppResponse(updated)
  }

  private async reapply(app: App): Promise<void> {
    const placement = await this.repository.findPlacementBySlug(app.slug)
    if (!placement) {
      return
    }

    const liveUuid = await this.deployBackend.readLiveReleaseUuid(
      namespaceOf(placement.project, placement.environment),
      app.slug,
    )
    if (!liveUuid) {
      return
    }

    const release = await this.repository.findRelease(liveUuid as ReleaseUuid, app.uuid)
    if (release) {
      await this.applyRelease.apply(placement, release)
    }
  }

  private credentialsEnc(command: UpdateAppCommand): string | null | undefined {
    const credentials = command.imagePullCredentials
    return credentials ? this.credentialsCipher.seal(credentials) : credentials
  }
}
