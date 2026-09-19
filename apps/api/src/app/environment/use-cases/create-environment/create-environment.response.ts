import { ApiProperty } from '@nestjs/swagger'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import type { Project } from '#src/app/project/entities/project.table.js'

export class CreateEnvironmentResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly uuid: string

  @ApiProperty({ type: String, example: 'Development' })
  readonly name: string

  @ApiProperty({ type: String, example: 'dev' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'demo-dev' })
  readonly namespace: string

  @ApiProperty({ type: String, example: 'demo' })
  readonly projectSlug: string

  constructor(project: Project, environment: Environment) {
    this.uuid = environment.uuid
    this.name = environment.name
    this.slug = environment.slug
    this.namespace = namespaceOf(project, environment)
    this.projectSlug = project.slug
  }
}
