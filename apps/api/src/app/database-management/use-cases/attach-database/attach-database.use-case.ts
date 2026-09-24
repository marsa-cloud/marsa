import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import { envPrefixOf } from '#src/app/database-management/entities/attachment-env.js'
import { catalogueEntry } from '#src/app/database-management/catalogue/engine-catalogue.js'
import { AttachDatabaseCommand } from '#src/app/database-management/use-cases/attach-database/attach-database.command.js'
import { AttachDatabaseRepository } from '#src/app/database-management/use-cases/attach-database/attach-database.repository.js'
import { AttachDatabaseResponse } from '#src/app/database-management/use-cases/attach-database/attach-database.response.js'
import { deploySpecOf } from '#src/app/release/entities/release-deploy-spec.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import type { Database, Executor } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'

@Injectable()
export class AttachDatabaseUseCase {
  private readonly baseDomain: string

  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: AttachDatabaseRepository,
    private readonly appRuntime: AppRuntime,
    private readonly cipher: ImagePullCredentialsCipher,
    config: ConfigService,
  ) {
    this.baseDomain = config.getOrThrow<string>('MARSA_BASE_DOMAIN')
  }

  async execute(appSlug: string, command: AttachDatabaseCommand): Promise<AttachDatabaseResponse> {
    const alias = command.alias ?? null

    return this.db.transaction(async (tx) => {
      const placement = await this.repository.lockApp(tx, appSlug)
      if (!placement) {
        throw new NotFoundException(`App '${appSlug}' was not found.`)
      }

      const database = await this.repository.findDatabaseInEnvironment(
        tx,
        placement.app.environmentUuid,
        command.databaseSlug,
      )
      if (!database) {
        throw new NotFoundException(
          `Database '${command.databaseSlug}' was not found in this app's environment.`,
        )
      }

      const outcome = await this.repository.insert(tx, placement.app.uuid, database.uuid, alias)
      if (outcome === 'already-attached') {
        throw new ConflictException(
          `Database '${command.databaseSlug}' is already attached to '${appSlug}'.`,
        )
      }
      if (outcome === 'alias-taken') {
        throw new ConflictException(
          alias === null
            ? `App '${appSlug}' already has an unprefixed database attached. Pass an alias, e.g. "analytics".`
            : `App '${appSlug}' already has an attachment aliased '${alias}'.`,
        )
      }

      await this.reapply(tx, placement)

      const entry = catalogueEntry(database.engine, database.version)
      const prefix = envPrefixOf(alias) ?? ''
      const variables = (entry?.publishedKeys ?? []).map((key) => `${prefix}${key}`)
      return new AttachDatabaseResponse(database.slug, alias, variables)
    })
  }

  // Nothing live means nothing to patch: the variables land on the app's first deploy.
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
