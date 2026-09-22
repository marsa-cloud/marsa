import type { Project } from '#src/app/project/entities/project.table.js'
import type { ProjectUuid } from '#src/app/project/entities/project.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

export class ProjectBuilder {
  private readonly project: Project

  constructor() {
    const now = new Date()
    this.project = {
      uuid: generateUuid<ProjectUuid>(),
      name: 'My Project',
      slug: 'my-project',
      createdAt: now,
      updatedAt: now,
    }
  }

  withName(name: string): this {
    this.project.name = name
    return this
  }

  withSlug(slug: string): this {
    this.project.slug = slug
    return this
  }

  build(): Project {
    return this.project
  }
}
