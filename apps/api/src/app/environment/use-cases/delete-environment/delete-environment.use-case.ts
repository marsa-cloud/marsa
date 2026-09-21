import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import { DeleteEnvironmentRepository } from '#src/app/environment/use-cases/delete-environment/delete-environment.repository.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { isForeignKeyViolation } from '#src/modules/database/postgres-errors.js'
import { NamespaceBackend } from '#src/modules/kubernetes/namespace-backend.js'

@Injectable()
export class DeleteEnvironmentUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: DeleteEnvironmentRepository,
    private readonly namespaces: NamespaceBackend,
  ) {}

  async execute(projectSlug: string, environmentSlug: string): Promise<void> {
    const found = await this.repository.findBySlugs(projectSlug, environmentSlug)
    if (!found) {
      throw new NotFoundException(
        `Environment '${environmentSlug}' was not found in project '${projectSlug}'.`,
      )
    }
    const namespace = namespaceOf(found.project, found.environment)

    try {
      // The namespace is deleted inside the transaction so a cluster failure keeps the row.
      await this.db.transaction(async (tx) => {
        await this.repository.delete(tx, found.environment.uuid)
        await this.destroy(namespace, found.environment.uuid)
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

  private async destroy(namespace: string, environmentUuid: string): Promise<void> {
    try {
      await this.namespaces.destroy(namespace, environmentUuid)
    } catch (error) {
      throw new BadGatewayException(
        `Could not delete namespace '${namespace}' from the cluster. Please try again.`,
        { cause: error },
      )
    }
  }
}
