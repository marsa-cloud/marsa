import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import { DeleteEnvironmentRepository } from '#src/app/environment/use-cases/delete-environment/delete-environment.repository.js'
import { NamespaceBackend } from '#src/modules/kubernetes/namespace-backend.js'

@Injectable()
export class DeleteEnvironmentUseCase {
  constructor(
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

    const outcome = await this.repository.deleteThen(found.environment.uuid, () =>
      this.destroy(namespace),
    )
    if (outcome === 'in-use') {
      throw new ConflictException(
        `Environment '${environmentSlug}' still has apps. Delete them first.`,
      )
    }
  }

  private async destroy(namespace: string): Promise<void> {
    try {
      await this.namespaces.destroy(namespace)
    } catch (error) {
      throw new BadGatewayException(
        `Could not delete namespace '${namespace}' from the cluster. Please try again.`,
        { cause: error },
      )
    }
  }
}
