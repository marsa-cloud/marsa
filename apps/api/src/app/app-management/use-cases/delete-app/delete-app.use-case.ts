import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import { DeleteAppRepository } from '#src/app/app-management/use-cases/delete-app/delete-app.repository.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'

@Injectable()
export class DeleteAppUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: DeleteAppRepository,
    private readonly appRuntime: AppRuntime,
    private readonly imageRegistry: ImageRegistry,
  ) {}

  async execute(slug: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const placement = await this.repository.findBySlug(tx, slug)
      if (!placement) {
        throw new NotFoundException(`App '${slug}' was not found.`)
      }
      await this.repository.deleteWithReleases(tx, placement.app.uuid)
      await this.destroy(placement)
      await this.deleteImages(placement.app.slug)
    })
  }

  private async destroy(placement: AppPlacement): Promise<void> {
    try {
      await this.appRuntime.destroy(placement)
    } catch (error) {
      // The rows roll back, so the app stays listed and the delete can be retried.
      throw new BadGatewayException(
        `Could not remove '${placement.app.slug}' from the cluster. Please try again.`,
        { cause: error },
      )
    }
  }

  private async deleteImages(slug: string): Promise<void> {
    try {
      await this.imageRegistry.deleteRepository(slug)
    } catch (error) {
      throw new BadGatewayException(
        `Could not remove the images of '${slug}' from the registry. Please try again.`,
        { cause: error },
      )
    }
  }
}
