import { DeployAppCommand } from '#src/app/release/use-cases/deploy-app/deploy-app.command.js'
import type { ImagePullCredentials } from '#src/app/release/use-cases/deploy-app/image-pull-credentials.js'

/** Test-side builder for {@link DeployAppCommand}; on the request path Nest deserialises the DTO. */
export class DeployAppCommandBuilder {
  private readonly command: DeployAppCommand

  constructor() {
    this.command = new DeployAppCommand()
    this.command.slug = 'my-app'
    this.command.image = 'nginx:1.27'
    this.command.containerPort = 80
  }

  withSlug(slug: string): this {
    this.command.slug = slug
    return this
  }

  withImage(image: string): this {
    this.command.image = image
    return this
  }

  withContainerPort(containerPort: number): this {
    this.command.containerPort = containerPort
    return this
  }

  withReplicas(replicas: number): this {
    this.command.replicas = replicas
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

  build(): DeployAppCommand {
    return this.command
  }
}
