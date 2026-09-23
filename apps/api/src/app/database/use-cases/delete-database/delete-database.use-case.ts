import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common'
import {
  type DatabasePlacement,
  databaseRefOf,
} from '#src/app/database/queries/database-placement.js'
import { DeleteDatabaseRepository } from '#src/app/database/use-cases/delete-database/delete-database.repository.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { DatabaseRuntime } from '#src/modules/runtime/database-runtime.js'

@Injectable()
export class DeleteDatabaseUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: DeleteDatabaseRepository,
    private readonly runtime: DatabaseRuntime,
  ) {}

  async execute(slug: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const placement = await this.repository.findBySlug(tx, slug)
      if (!placement) {
        throw new NotFoundException(`Database '${slug}' was not found.`)
      }
      await this.repository.delete(tx, placement.database.uuid)
      await this.destroy(placement)
    })
  }

  private async destroy(placement: DatabasePlacement): Promise<void> {
    try {
      await this.runtime.destroy(databaseRefOf(placement))
    } catch (error) {
      // The row rolls back, so the database stays listed and the delete can be retried.
      throw new BadGatewayException(
        `Could not remove '${placement.database.slug}' from the cluster. Please try again.`,
        { cause: error },
      )
    }
  }
}
