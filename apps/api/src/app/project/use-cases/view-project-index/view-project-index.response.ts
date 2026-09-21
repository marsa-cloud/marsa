import { ApiProperty } from '@nestjs/swagger'
import type { Project } from '#src/app/project/entities/project.table.js'

export class ProjectSummary {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly uuid: string

  @ApiProperty({ type: String, example: 'Demo' })
  readonly name: string

  @ApiProperty({ type: String, example: 'demo' })
  readonly slug: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  constructor(project: Project) {
    this.uuid = project.uuid
    this.name = project.name
    this.slug = project.slug
    this.createdAt = project.createdAt.toISOString()
  }
}

export class ViewProjectIndexResponse {
  @ApiProperty({ type: [ProjectSummary] })
  readonly items: ProjectSummary[]

  constructor(projects: Project[]) {
    this.items = projects.map((project) => new ProjectSummary(project))
  }
}
