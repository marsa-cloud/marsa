import { ApiProperty } from '@nestjs/swagger'
import type { Environment } from '#src/app/environment/entities/environment.table.js'
import { namespaceOf } from '#src/app/environment/entities/namespace.js'
import { ViewEnvironmentIndexQueryKey } from '#src/app/environment/use-cases/view-environment-index/query/view-environment-index.query.js'
import type { Project } from '#src/app/project/entities/project.table.js'
import {
  PaginatedKeysetResponse,
  PaginatedKeysetResponseMeta,
} from '#src/utils/pagination/keyset/paginated-keyset.response.js'

export class EnvironmentSummary {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly uuid: string

  @ApiProperty({ type: String, example: 'Development' })
  readonly name: string

  @ApiProperty({ type: String, example: 'dev' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'demo-dev' })
  readonly namespace: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  constructor(project: Project, environment: Environment) {
    this.uuid = environment.uuid
    this.name = environment.name
    this.slug = environment.slug
    this.namespace = namespaceOf(project, environment)
    this.createdAt = environment.createdAt.toISOString()
  }
}

export class ViewEnvironmentIndexResponseMeta extends PaginatedKeysetResponseMeta {
  @ApiProperty({ type: ViewEnvironmentIndexQueryKey, nullable: true })
  declare readonly next: ViewEnvironmentIndexQueryKey | null

  constructor(environments: Environment[]) {
    super(ViewEnvironmentIndexQueryKey.nextKey(environments))
  }
}

export class ViewEnvironmentIndexResponse extends PaginatedKeysetResponse<EnvironmentSummary> {
  @ApiProperty({ type: [EnvironmentSummary] })
  declare readonly items: EnvironmentSummary[]

  @ApiProperty({ type: ViewEnvironmentIndexResponseMeta })
  declare readonly meta: ViewEnvironmentIndexResponseMeta

  constructor(project: Project, environments: Environment[]) {
    super(
      environments.map((environment) => new EnvironmentSummary(project, environment)),
      new ViewEnvironmentIndexResponseMeta(environments),
    )
  }
}
