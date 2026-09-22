import { ApiProperty } from '@nestjs/swagger'
import type { Project } from '#src/app/project/entities/project.table.js'

export class CreateProjectResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly uuid: string

  @ApiProperty({ type: String, example: 'Demo' })
  readonly name: string

  @ApiProperty({ type: String, example: 'demo' })
  readonly slug: string

  constructor(project: Project) {
    this.uuid = project.uuid
    this.name = project.name
    this.slug = project.slug
  }
}
