import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { App } from '#src/app/app-management/entities/app.table.js'
import { DEFAULT_SOURCE_CONTAINER_PORT } from '#src/app/app-management/entities/app-config.constants.js'
import { type AppSource, appSourceOf } from '#src/app/app-management/entities/app-source.js'
import { CreateAppCommand } from '#src/app/app-management/use-cases/create-app/create-app.command.js'
import { CreateAppRepository } from '#src/app/app-management/use-cases/create-app/create-app.repository.js'
import { CreateAppResponse } from '#src/app/app-management/use-cases/create-app/create-app.response.js'
import { BuildTrigger } from '#src/app/build-management/enums/build-trigger.enum.js'
import { BuildStarter } from '#src/app/build-management/services/build-starter/build-starter.service.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class CreateAppUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: CreateAppRepository,
    private readonly credentialsCipher: ImagePullCredentialsCipher,
    private readonly starter: BuildStarter,
    private readonly config: ConfigService,
  ) {}

  async execute(command: CreateAppCommand): Promise<CreateAppResponse> {
    const source = command.source ? appSourceOf(command.source) : null
    // GitHub is asked before anything is written, so an unreadable repo leaves no app behind.
    const head = source ? await this.starter.resolveHead(source) : null
    const app = this.appOf(command, source)

    await this.db.transaction(async (tx) => {
      const placement = await this.repository.findEnvironmentForUpdate(tx, command.environmentUuid)
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
      if (head) {
        await this.starter.start(tx, app, { trigger: BuildTrigger.Create, ...head })
      }
    })

    return new CreateAppResponse(app, this.config.getOrThrow<string>('MARSA_BASE_DOMAIN'))
  }

  private appOf(command: CreateAppCommand, source: AppSource | null): App {
    const minReplicas = command.minReplicas ?? 1
    const credentials = command.imagePullCredentials
    return new AppBuilder()
      .withEnvironmentUuid(command.environmentUuid)
      .withSlug(command.slug)
      .withDomain({ type: 'subdomain' })
      .withImage(command.image ?? null)
      .withSource(source)
      .withContainerPort(command.containerPort ?? DEFAULT_SOURCE_CONTAINER_PORT)
      .withMinReplicas(minReplicas)
      .withMaxReplicas(Math.max(command.maxReplicas ?? 1, minReplicas))
      .withEnv(command.env ?? {})
      .withNodePin(command.nodePin ?? null)
      .withImagePullCredentialsEnc(credentials ? this.credentialsCipher.seal(credentials) : null)
      .build()
  }
}
