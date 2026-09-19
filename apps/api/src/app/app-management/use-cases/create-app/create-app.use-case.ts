import { ConflictException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { CreateAppCommand } from '#src/app/app-management/use-cases/create-app/create-app.command.js'
import { CreateAppRepository } from '#src/app/app-management/use-cases/create-app/create-app.repository.js'
import { CreateAppResponse } from '#src/app/app-management/use-cases/create-app/create-app.response.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'

@Injectable()
export class CreateAppUseCase {
  constructor(
    private readonly repository: CreateAppRepository,
    private readonly credentialsCipher: ImagePullCredentialsCipher,
    private readonly config: ConfigService,
  ) {}

  async execute(command: CreateAppCommand): Promise<CreateAppResponse> {
    const minReplicas = command.minReplicas ?? 1
    const credentials = command.imagePullCredentials

    const app = new AppBuilder()
      .withSlug(command.slug)
      .withDomain({ type: 'subdomain' })
      .withImage(command.image)
      .withContainerPort(command.containerPort)
      .withMinReplicas(minReplicas)
      .withMaxReplicas(Math.max(command.maxReplicas ?? 1, minReplicas))
      .withEnv(command.env ?? {})
      .withImagePullCredentialsEnc(credentials ? this.credentialsCipher.seal(credentials) : null)
      .build()

    if (!(await this.repository.insert(app))) {
      throw new ConflictException(`An app with slug '${command.slug}' already exists.`)
    }

    return new CreateAppResponse(app, this.config.getOrThrow<string>('MARSA_BASE_DOMAIN'))
  }
}
