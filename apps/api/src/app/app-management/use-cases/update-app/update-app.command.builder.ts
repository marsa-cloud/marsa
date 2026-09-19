import type { ImagePullCredentials } from '#src/app/app-management/entities/image-pull-credentials.js'
import { UpdateAppCommand } from '#src/app/app-management/use-cases/update-app/update-app.command.js'

export class UpdateAppCommandBuilder {
  private readonly command = new UpdateAppCommand()

  withImage(image: string): this {
    this.command.image = image
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

  withImagePullCredentials(imagePullCredentials: ImagePullCredentials | null): this {
    this.command.imagePullCredentials = imagePullCredentials
    return this
  }

  build(): UpdateAppCommand {
    return this.command
  }
}
