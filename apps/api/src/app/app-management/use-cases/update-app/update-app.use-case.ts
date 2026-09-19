import { Injectable, NotFoundException } from '@nestjs/common'
import type { App } from '#src/app/app-management/entities/app.table.js'
import { UpdateAppCommand } from '#src/app/app-management/use-cases/update-app/update-app.command.js'
import { UpdateAppRepository } from '#src/app/app-management/use-cases/update-app/update-app.repository.js'
import { UpdateAppResponse } from '#src/app/app-management/use-cases/update-app/update-app.response.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'

// Writes App only: the running app keeps its config until the operator deploys a new release.
@Injectable()
export class UpdateAppUseCase {
  constructor(
    private readonly repository: UpdateAppRepository,
    private readonly credentialsCipher: ImagePullCredentialsCipher,
  ) {}

  async execute(slug: string, command: UpdateAppCommand): Promise<UpdateAppResponse> {
    const app = await this.repository.findBySlug(slug)
    if (!app) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }

    // The DTO can only compare the fields one command carries; the stored floor may be higher.
    const minReplicas = command.minReplicas ?? app.minReplicas
    const maxReplicas = Math.max(command.maxReplicas ?? app.maxReplicas, minReplicas)

    const updated = await this.repository.update(app.uuid, {
      image: command.image ?? app.image,
      containerPort: command.containerPort ?? app.containerPort,
      minReplicas,
      maxReplicas,
      env: command.env ?? app.env,
      imagePullCredentialsEnc: this.credentialsEnc(app, command),
    })
    if (!updated) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }

    return new UpdateAppResponse(updated)
  }

  private credentialsEnc(app: App, command: UpdateAppCommand): string | null {
    if (command.imagePullCredentials === undefined) return app.imagePullCredentialsEnc
    if (command.imagePullCredentials === null) return null
    return this.credentialsCipher.seal(command.imagePullCredentials)
  }
}
