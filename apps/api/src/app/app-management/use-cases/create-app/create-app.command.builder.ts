import type { ImagePullCredentials } from '#src/app/app-management/entities/image-pull-credentials.js'
import { CreateAppCommand } from '#src/app/app-management/use-cases/create-app/create-app.command.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

export class CreateAppCommandBuilder {
  private readonly command: CreateAppCommand

  constructor() {
    this.command = new CreateAppCommand()
    this.command.environmentUuid = generateUuid<EnvironmentUuid>()
    this.command.slug = 'my-app'
    this.command.image = 'nginx:1.27'
    this.command.containerPort = 80
  }

  withEnvironmentUuid(environmentUuid: EnvironmentUuid): this {
    this.command.environmentUuid = environmentUuid
    return this
  }

  withSlug(slug: string): this {
    this.command.slug = slug
    return this
  }

  withMinReplicas(minReplicas: number): this {
    this.command.minReplicas = minReplicas
    return this
  }

  withMaxReplicas(maxReplicas: number): this {
    this.command.maxReplicas = maxReplicas
    return this
  }

  withEnv(env: Record<string, string>): this {
    this.command.env = env
    return this
  }

  withImagePullCredentials(imagePullCredentials: ImagePullCredentials): this {
    this.command.imagePullCredentials = imagePullCredentials
    return this
  }

  build(): CreateAppCommand {
    return this.command
  }
}
