import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { CreateAppCommand } from '#src/app/app-management/use-cases/create-app/create-app.command.js'
import { CreateAppRepository } from '#src/app/app-management/use-cases/create-app/create-app.repository.js'
import { CreateAppResponse } from '#src/app/app-management/use-cases/create-app/create-app.response.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class CreateAppUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: CreateAppRepository,
    private readonly credentialsCipher: ImagePullCredentialsCipher,
    private readonly config: ConfigService,
  ) {}

  async execute(command: CreateAppCommand): Promise<CreateAppResponse> {
    const minReplicas = command.minReplicas ?? 1
    const credentials = command.imagePullCredentials

    const app = new AppBuilder()
      .withEnvironmentUuid(command.environmentUuid)
      .withSlug(command.slug)
      .withDomain({ type: 'subdomain' })
      .withImage(command.image)
      .withContainerPort(command.containerPort)
      .withMinReplicas(minReplicas)
      .withMaxReplicas(Math.max(command.maxReplicas ?? 1, minReplicas))
      .withEnv(command.env ?? {})
      .withNodePin(command.nodePin ?? null)
      .withImagePullCredentialsEnc(credentials ? this.credentialsCipher.seal(credentials) : null)
      .build()

    await this.db.transaction(async (tx) => {
      const placement = await this.repository.lockEnvironment(tx, command.environmentUuid)
      if (!placement) {
        throw new NotFoundException(`Environment '${command.environmentUuid}' was not found.`)
      }

      // Apps and databases share the environment's namespace, so one name serves both.
      const taken = await this.repository.isNameTaken(tx, command.environmentUuid, command.slug)
      if (taken) {
        throw new ConflictException(
          `An app or database named '${command.slug}' already exists in this environment.`,
        )
      }

      const outcome = await this.repository.insert(tx, app)
      if (outcome === 'slug-taken') {
        throw new ConflictException(`An app with slug '${command.slug}' already exists.`)
      }
    })

    return new CreateAppResponse(app, this.config.getOrThrow<string>('MARSA_BASE_DOMAIN'))
  }
}
