import { ApiProperty } from '@nestjs/swagger'
import type { Project } from '#src/app/project/entities/project.table.js'
import { ViewProjectIndexQueryKey } from '#src/app/project/use-cases/view-project-index/query/view-project-index.query.js'
import {
  PaginatedKeysetResponse,
  PaginatedKeysetResponseMeta,
} from '#src/utils/pagination/keyset/paginated-keyset.response.js'

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

export class ViewProjectIndexResponseMeta extends PaginatedKeysetResponseMeta {
  @ApiProperty({ type: ViewProjectIndexQueryKey, nullable: true })
  declare readonly next: ViewProjectIndexQueryKey | null

  constructor(projects: Project[]) {
    super(ViewProjectIndexQueryKey.nextKey(projects))
  }
}

export class ViewProjectIndexResponse extends PaginatedKeysetResponse<ProjectSummary> {
  @ApiProperty({ type: [ProjectSummary] })
  declare readonly items: ProjectSummary[]

  @ApiProperty({ type: ViewProjectIndexResponseMeta })
  declare readonly meta: ViewProjectIndexResponseMeta

  constructor(projects: Project[]) {
    super(
      projects.map((project) => new ProjectSummary(project)),
      new ViewProjectIndexResponseMeta(projects),
    )
  }
}
