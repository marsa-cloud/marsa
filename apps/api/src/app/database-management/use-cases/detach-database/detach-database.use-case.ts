import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import { DetachDatabaseRepository } from '#src/app/database-management/use-cases/detach-database/detach-database.repository.js'
import { deploySpecOf } from '#src/app/release/entities/release-deploy-spec.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import type { Database, Executor } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'

@Injectable()
export class DetachDatabaseUseCase {
  private readonly baseDomain: string

  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: DetachDatabaseRepository,
    private readonly appRuntime: AppRuntime,
    private readonly cipher: ImagePullCredentialsCipher,
    config: ConfigService,
  ) {
    this.baseDomain = config.getOrThrow<string>('MARSA_BASE_DOMAIN')
  }

  async execute(appSlug: string, databaseSlug: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const placement = await this.repository.lockApp(tx, appSlug)
      if (!placement) {
        throw new NotFoundException(`App '${appSlug}' was not found.`)
      }

      const detached = await this.repository.deleteAttachment(tx, placement.app.uuid, databaseSlug)
      if (!detached) {
        throw new NotFoundException(`Database '${databaseSlug}' is not attached to '${appSlug}'.`)
      }

      await this.reapply(tx, placement)
    })
  }

  // Nothing live means nothing to patch: the app has no variables to lose yet.
  private async reapply(tx: Executor, placement: AppPlacement): Promise<void> {
    const liveUuid = await this.appRuntime.readLiveReleaseUuid(placement)
    if (!liveUuid) {
      return
    }
    const release = await this.repository.findRelease(tx, liveUuid, placement.app.uuid)
    if (!release) {
      return
    }

    const credentials = this.cipher.openForApp(placement.app.slug, release.imagePullCredentialsEnc)
    const attachments = await this.repository.findAttachments(tx, placement.app.uuid)
    const spec = deploySpecOf(placement, release, {
      baseDomain: this.baseDomain,
      attachments,
      credentials,
    })

    try {
      await this.appRuntime.deploy(placement, spec)
    } catch (error) {
      throw new BadGatewayException(
        `Could not update '${placement.app.slug}' in the cluster. Please try again.`,
        { cause: error },
      )
    }
  }
}
