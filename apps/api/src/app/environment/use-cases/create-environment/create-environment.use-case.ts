import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import { environmentRefOf } from '#src/app/environment/entities/environment-ref.js'
import { CreateEnvironmentCommand } from '#src/app/environment/use-cases/create-environment/create-environment.command.js'
import { CreateEnvironmentRepository } from '#src/app/environment/use-cases/create-environment/create-environment.repository.js'
import { CreateEnvironmentResponse } from '#src/app/environment/use-cases/create-environment/create-environment.response.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import { EnvironmentConflictError } from '#src/modules/runtime/runtime.errors.js'
import type { EnvironmentRef } from '#src/modules/runtime/runtime.types.js'

@Injectable()
export class CreateEnvironmentUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: CreateEnvironmentRepository,
    private readonly environments: EnvironmentRuntime,
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
    const ref = environmentRefOf(project, environment)

    // Provisioning runs inside the transaction so a runtime failure rolls the row back with it.
    const created = await this.db.transaction(async (tx) => {
      const inserted = await this.repository.insert(tx, environment)
      if (!inserted) {
        return false
      }
      await this.provision(ref)
      return true
    })
    if (!created) {
      throw new ConflictException(
        `Project '${projectSlug}' already has an environment '${command.slug}'.`,
      )
    }

    return new CreateEnvironmentResponse(project, environment)
  }

  private async provision(ref: EnvironmentRef): Promise<void> {
    try {
      await this.environments.provision(ref)
    } catch (error) {
      if (error instanceof EnvironmentConflictError) {
        throw new ConflictException(error.message)
      }
      // The row rolls back, so a half-provisioned environment labelled with this uuid would block retries.
      await this.environments.destroy(ref).catch(() => undefined)
      throw new BadGatewayException(
        `Could not provision environment '${ref.projectSlug}/${ref.environmentSlug}'. Please try again.`,
        { cause: error },
      )
    }
  }
}
