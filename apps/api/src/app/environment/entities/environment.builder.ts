import type { Environment } from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import type { Project } from '#src/app/project/entities/project.table.js'
import type { ProjectUuid } from '#src/app/project/entities/project.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

export class EnvironmentBuilder {
  private readonly environment: Environment

  constructor() {
    const now = new Date()
    this.environment = {
      uuid: generateUuid<EnvironmentUuid>(),
      projectUuid: generateUuid<ProjectUuid>(),
      name: 'Production',
      slug: 'production',
      createdAt: now,
      updatedAt: now,
    }
  }

  withProject(project: Project): this {
    this.environment.projectUuid = project.uuid
    return this
  }

  withName(name: string): this {
    this.environment.name = name
    return this
  }

  withSlug(slug: string): this {
    this.environment.slug = slug
    return this
  }

  build(): Environment {
    return this.environment
  }
}
