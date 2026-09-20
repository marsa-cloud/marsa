import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import type { AppPlacement } from '#src/app/app-management/entities/app-placement.js'
import { nodePinEquals } from '#src/app/app-management/entities/node-pin.js'
import { UpdateAppCommand } from '#src/app/app-management/use-cases/update-app/update-app.command.js'
import { UpdateAppRepository } from '#src/app/app-management/use-cases/update-app/update-app.repository.js'
import { UpdateAppResponse } from '#src/app/app-management/use-cases/update-app/update-app.response.js'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import { ApplyReleaseService } from '#src/app/release/services/apply-release/apply-release.service.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import { isUuid } from '#src/utils/uuid.js'

// Writes App, then re-applies only when the pin actually changed: a pin is location rather than
// config, so it never reaches a Release and hasUndeployedChanges structurally cannot see it.
@Injectable()
export class UpdateAppUseCase {
  private readonly logger = new Logger(UpdateAppUseCase.name)

  constructor(
    private readonly repository: UpdateAppRepository,
    private readonly credentialsCipher: ImagePullCredentialsCipher,
    private readonly deployBackend: DeployBackend,
    private readonly applyRelease: ApplyReleaseService,
  ) {}

  async execute(slug: string, command: UpdateAppCommand): Promise<UpdateAppResponse> {
    // Cluster first, database second. If the apply fails nothing is stored, so an identical retry
    // still sees a changed pin and applies again. Storing first made the retry a no-op — the row
    // already matched — leaving the cluster on the old affinity with nothing to surface the drift.
    const pinned = command.nodePin === undefined ? undefined : await this.applyPin(slug, command)

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
    if (pinned === 'missing') {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }

    return new UpdateAppResponse(updated)
  }

  private async applyPin(
    slug: string,
    command: UpdateAppCommand,
  ): Promise<'applied' | 'unchanged' | 'missing'> {
    const placement = await this.repository.findPlacementBySlug(slug)
    if (!placement) {
      return 'missing'
    }
    const nodePin = command.nodePin ?? null
    if (nodePinEquals(placement.app.nodePin, nodePin)) {
      return 'unchanged'
    }

    await this.reapply({ ...placement, app: { ...placement.app, nodePin } })
    return 'applied'
  }

  private async reapply(placement: AppPlacement): Promise<void> {
    const { app, project, environment } = placement
    const liveUuid = await this.deployBackend.readLiveReleaseUuid(
      namespaceOf(project, environment),
      app.slug,
    )
    if (!isUuid<ReleaseUuid>(liveUuid)) {
      return
    }

    const release = await this.repository.findRelease(liveUuid, app.uuid)
    if (!release) {
      // Nothing to re-render against; the pin is stored and the next deploy will carry it.
      this.logger.warn(
        `App '${app.slug}' runs release ${liveUuid}, which is not a release of this app. ` +
          'The new node pin will be saved but not applied; deploy to apply it.',
      )
      return
    }

    await this.applyRelease.apply(placement, release)
  }

  private credentialsEnc(command: UpdateAppCommand): string | null | undefined {
    const credentials = command.imagePullCredentials
    return credentials ? this.credentialsCipher.seal(credentials) : credentials
  }
}
