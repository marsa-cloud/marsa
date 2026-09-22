import { ApiProperty } from '@nestjs/swagger'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import type { Project } from '#src/app/project/entities/project.table.js'

export class CreateEnvironmentResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly uuid: string

  @ApiProperty({ type: String, example: 'Development' })
  readonly name: string

  @ApiProperty({ type: String, example: 'dev' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'demo' })
  readonly projectSlug: string

  constructor(project: Project, environment: Environment) {
    this.uuid = environment.uuid
    this.name = environment.name
    this.slug = environment.slug
    this.projectSlug = project.slug
  }
}
