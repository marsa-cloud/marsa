import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import type { Project } from '#src/app/project/entities/project.table.js'
import { DatabaseStatus } from '#src/modules/runtime/runtime.types.js'

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

// The status enum belongs to the runtime port; the decorator lives here so `enum` and
// `enumName` stay paired for the generated web client.
export const DatabaseStatusApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
  ApiProperty({ ...options, enum: DatabaseStatus, enumName: 'DatabaseStatus' })
