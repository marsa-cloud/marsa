import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { nodePinEquals } from '#src/app/app-management/entities/node-pin.js'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import { UpdateAppCommand } from '#src/app/app-management/use-cases/update-app/update-app.command.js'
import { UpdateAppRepository } from '#src/app/app-management/use-cases/update-app/update-app.repository.js'
import { UpdateAppResponse } from '#src/app/app-management/use-cases/update-app/update-app.response.js'
import { deploySpecOf } from '#src/app/release/entities/release-deploy-spec.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import type { Database, Executor } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'

// Writes App, then re-applies only when the pin actually changed: a pin is location rather than
// config, so it never reaches a Release and hasUndeployedChanges structurally cannot see it.
@Injectable()
export class UpdateAppUseCase {
  private readonly baseDomain: string

  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: UpdateAppRepository,
    private readonly credentialsCipher: ImagePullCredentialsCipher,
    private readonly appRuntime: AppRuntime,
    config: ConfigService,
  ) {
    this.baseDomain = config.getOrThrow<string>('MARSA_BASE_DOMAIN')
  }

  async execute(slug: string, command: UpdateAppCommand): Promise<UpdateAppResponse> {
    return this.db.transaction(async (tx) => {
      const placement = await this.repository.findPlacementBySlug(tx, slug)
      if (!placement) {
        throw new NotFoundException(`App '${slug}' was not found.`)
      }

      const updated = await this.repository.updateBySlug(tx, slug, {
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

      const pinChanged =
        command.nodePin !== undefined && !nodePinEquals(placement.app.nodePin, updated.nodePin)
      if (pinChanged) {
        await this.reapply(tx, { ...placement, app: updated })
      }
      return new UpdateAppResponse(updated)
    })
  }

  private async reapply(tx: Executor, placement: AppPlacement): Promise<void> {
    const liveUuid = await this.appRuntime.readLiveReleaseUuid(placement)
    if (!liveUuid) {
      return
    }

    const release = await this.repository.findRelease(tx, liveUuid, placement.app.uuid)
    if (!release) {
      // The runtime runs a release Marsa has no record of for this app: state is already wrong.
      throw new InternalServerErrorException(
        `App '${placement.app.slug}' is running release ${liveUuid}, which is not a release of this app.`,
      )
    }

    const credentials = this.credentialsCipher.openForApp(
      placement.app.slug,
      release.imagePullCredentialsEnc,
    )
    const attachments = await this.repository.findAttachments(tx, placement.app.uuid)
    const spec = deploySpecOf(placement, release, {
      baseDomain: this.baseDomain,
      attachments,
      credentials,
    })
    await this.appRuntime.deploy(placement, spec)
  }

  private credentialsEnc(command: UpdateAppCommand): string | null | undefined {
    const credentials = command.imagePullCredentials
    return credentials ? this.credentialsCipher.seal(credentials) : credentials
  }
}
