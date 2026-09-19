import { ApiProperty } from '@nestjs/swagger'
import type { AppPlacement } from '#src/app/app-management/entities/app-placement.js'
import {
  AppEnvironmentRef,
  AppProjectRef,
} from '#src/app/app-management/entities/app-placement.response.js'
import { ViewAppIndexQueryKey } from '#src/app/app-management/use-cases/view-app-index/query/view-app-index.query.js'
import {
  PaginatedKeysetResponse,
  PaginatedKeysetResponseMeta,
} from '#src/utils/pagination/keyset/paginated-keyset.response.js'

export class AppSummary {
  @ApiProperty({ type: String, example: 'my-app' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'nginx:1.27' })
  readonly image: string

  @ApiProperty({ type: String, example: 'https://my-app.demo.marsa.cc' })
  readonly url: string

  @ApiProperty({ type: AppProjectRef })
  readonly project: AppProjectRef

  @ApiProperty({ type: AppEnvironmentRef })
  readonly environment: AppEnvironmentRef

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt: string

  constructor({ app, project, environment }: AppPlacement, baseDomain: string) {
    this.slug = app.slug
    this.image = app.image
    this.url = `https://${app.slug}.${baseDomain}`
    this.project = new AppProjectRef(project)
    this.environment = new AppEnvironmentRef(environment)
    this.createdAt = app.createdAt.toISOString()
    this.updatedAt = app.updatedAt.toISOString()
  }
}

export class ViewAppIndexResponseMeta extends PaginatedKeysetResponseMeta {
  @ApiProperty({ type: ViewAppIndexQueryKey, nullable: true })
  declare readonly next: ViewAppIndexQueryKey | null

  constructor(placements: AppPlacement[]) {
    super(ViewAppIndexQueryKey.nextKey(placements.map((placement) => placement.app)))
  }
}

export class ViewAppIndexResponse extends PaginatedKeysetResponse<AppSummary> {
  @ApiProperty({ type: [AppSummary] })
  declare readonly items: AppSummary[]

  // Redeclared so the generated client types the cursor; inheriting `meta` loses it.
  @ApiProperty({ type: ViewAppIndexResponseMeta })
  declare readonly meta: ViewAppIndexResponseMeta

  constructor(placements: AppPlacement[], baseDomain: string) {
    super(
      placements.map((placement) => new AppSummary(placement, baseDomain)),
      new ViewAppIndexResponseMeta(placements),
    )
  }
}
