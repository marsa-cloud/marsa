import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { DatabaseUuid } from '#src/app/database-management/entities/database.uuid.js'
import type { DatabasePlacement } from '#src/app/database-management/queries/database-placement.js'
import { DeleteDatabaseRepository } from '#src/app/database-management/use-cases/delete-database/delete-database.repository.js'
import type { Database, Executor } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { isForeignKeyViolation } from '#src/modules/database/postgres-errors.js'
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
      const placement = await this.repository.findPlacementBySlugForUpdate(tx, slug)
      if (!placement) {
        throw new NotFoundException(`Database '${slug}' was not found.`)
      }
      await this.deleteRow(tx, slug, placement.database.uuid)
      await this.destroy(placement)
    })
  }

  // The delete rides a savepoint: a failed statement aborts its transaction, and the dependents
  // read has to happen after that rolls back.
  private async deleteRow(tx: Executor, slug: string, uuid: DatabaseUuid): Promise<void> {
    try {
      await tx.transaction(async (savepoint) => {
        await this.repository.delete(savepoint, uuid)
      })
    } catch (error) {
      if (!isForeignKeyViolation(error)) {
        throw error
      }
      // Read after the failure rather than checking first: a pre-check races a concurrent attach.
      const dependents = await this.repository.dependentApps(tx, uuid)
      throw new ConflictException(
        `Database '${slug}' is still attached to ${dependents.join(', ')}. Detach it there first.`,
      )
    }
  }

  private async destroy(placement: DatabasePlacement): Promise<void> {
    try {
      await this.runtime.destroy(placement)
    } catch (error) {
      // The row rolls back, so the database stays listed and the delete can be retried.
      throw new BadGatewayException(
        `Could not remove '${placement.database.slug}' from the cluster. Please try again.`,
        { cause: error },
      )
    }
  }
}
