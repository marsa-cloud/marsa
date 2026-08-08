import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common'
import { DeleteAppRepository } from '#src/app/app-management/use-cases/delete-app/delete-app.repository.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'

@Injectable()
export class DeleteAppUseCase {
  constructor(
    private readonly repository: DeleteAppRepository,
    private readonly deployBackend: DeployBackend,
  ) {}

  async execute(slug: string): Promise<void> {
    const app = await this.repository.findBySlug(slug)
    if (!app) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }

    try {
      await this.deployBackend.destroy(OPERATOR_APPS_NAMESPACE, slug)
    } catch (error) {
      // Rows stay put so the app remains listed and the delete can be retried.
      throw new BadGatewayException(
        `Could not remove '${slug}' from the cluster. Please try again.`,
        { cause: error },
      )
    }

    await this.repository.deleteWithReleases(app.uuid)
  }
}
