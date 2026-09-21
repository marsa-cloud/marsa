import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import { CreateEnvironmentCommand } from '#src/app/environment/use-cases/create-environment/create-environment.command.js'
import { CreateEnvironmentRepository } from '#src/app/environment/use-cases/create-environment/create-environment.repository.js'
import { CreateEnvironmentResponse } from '#src/app/environment/use-cases/create-environment/create-environment.response.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import {
  NamespaceBackend,
  NamespaceConflictError,
} from '#src/modules/kubernetes/namespace-backend.js'

@Injectable()
export class CreateEnvironmentUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: CreateEnvironmentRepository,
    private readonly namespaces: NamespaceBackend,
  ) {}

  async execute(
    projectSlug: string,
    command: CreateEnvironmentCommand,
  ): Promise<CreateEnvironmentResponse> {
    const project = await this.repository.findProjectBySlug(projectSlug)
    if (!project) {
      throw new NotFoundException(`Project '${projectSlug}' was not found.`)
    }

    const environment = new EnvironmentBuilder()
      .withProject(project)
      .withName(command.name)
      .withSlug(command.slug)
      .build()
    const namespace = namespaceOf(project, environment)

    // Provisioning runs inside the transaction so a cluster failure rolls the row back with it.
    const created = await this.db.transaction(async (tx) => {
      if (!(await this.repository.insert(tx, environment))) {
        return false
      }
      await this.provision(namespace, environment.uuid)
      return true
    })
    if (!created) {
      throw new ConflictException(
        `Project '${projectSlug}' already has an environment '${command.slug}'.`,
      )
    }

    return new CreateEnvironmentResponse(project, environment)
  }

  private async provision(namespace: string, environmentUuid: string): Promise<void> {
    try {
      await this.namespaces.provision(namespace, environmentUuid)
    } catch (error) {
      if (error instanceof NamespaceConflictError) {
        throw new ConflictException(error.message)
      }
      // The row rolls back, so a half-provisioned namespace labelled with this uuid would block retries.
      await this.namespaces.destroy(namespace, environmentUuid).catch(() => undefined)
      throw new BadGatewayException(
        `Could not create namespace '${namespace}' on the cluster. Please try again.`,
        { cause: error },
      )
    }
  }
}
