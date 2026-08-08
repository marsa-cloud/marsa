import { Injectable, NotFoundException } from '@nestjs/common'
import { UpdateAppEnvCommand } from '#src/app/app-management/use-cases/update-app-env/update-app-env.command.js'
import { UpdateAppEnvRepository } from '#src/app/app-management/use-cases/update-app-env/update-app-env.repository.js'
import { UpdateAppEnvResponse } from '#src/app/app-management/use-cases/update-app-env/update-app-env.response.js'

/**
 * Persists the app's env without touching the cluster. Applying it is a
 * separate, explicit redeploy — batching several config edits before rolling
 * beats an implicit restart on every keystroke-sized change.
 */
@Injectable()
export class UpdateAppEnvUseCase {
  constructor(private readonly repository: UpdateAppEnvRepository) {}

  async execute(slug: string, command: UpdateAppEnvCommand): Promise<UpdateAppEnvResponse> {
    const app = await this.repository.findBySlug(slug)
    if (!app) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }

    return new UpdateAppEnvResponse(await this.repository.updateEnv(app.uuid, command.env))
  }
}
