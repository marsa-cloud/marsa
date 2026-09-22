import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DeleteEnvironmentRepository } from '#src/app/environment/use-cases/delete-environment/delete-environment.repository.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { isForeignKeyViolation } from '#src/modules/database/postgres-errors.js'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import type { EnvironmentRef } from '#src/modules/runtime/runtime.types.js'

@Injectable()
export class DeleteEnvironmentUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: DeleteEnvironmentRepository,
    private readonly environments: EnvironmentRuntime,
  ) {}

  async execute(projectSlug: string, environmentSlug: string): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        const found = await this.repository.findBySlugs(tx, projectSlug, environmentSlug)
        if (!found) {
          throw new NotFoundException(
            `Environment '${environmentSlug}' was not found in project '${projectSlug}'.`,
          )
        }
        await this.repository.delete(tx, found.environment.uuid)
        await this.destroy(found)
      })
    } catch (error) {
      // The app FK is RESTRICT, so the DELETE itself fails while apps remain — no check-then-act race.
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(
          `Environment '${environmentSlug}' still has apps. Delete them first.`,
        )
      }
      throw error
    }
  }

  private async destroy(ref: EnvironmentRef): Promise<void> {
    try {
      await this.environments.destroy(ref)
    } catch (error) {
      throw new BadGatewayException(
        `Could not remove environment '${ref.project.slug}/${ref.environment.slug}'. Please try again.`,
        { cause: error },
      )
    }
  }
}
