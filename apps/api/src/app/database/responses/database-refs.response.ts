import { ApiProperty } from '@nestjs/swagger'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import type { Project } from '#src/app/project/entities/project.table.js'

export class DatabaseProjectRef {
  @ApiProperty({ type: String, example: 'demo' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'Demo' })
  readonly name: string

  constructor(project: Project) {
    this.slug = project.slug
    this.name = project.name
  }
}

export class DatabaseEnvironmentRef {
  @ApiProperty({ type: String, example: 'dev' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'Development' })
  readonly name: string

  constructor(environment: Environment) {
    this.slug = environment.slug
    this.name = environment.name
  }
}
