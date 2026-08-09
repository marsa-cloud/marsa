import { ApiProperty } from '@nestjs/swagger'
import type { App } from '#src/app/app-management/entities/app.table.js'
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

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt: string

  constructor(app: App, baseDomain: string) {
    this.slug = app.slug
    this.image = app.image
    this.url = `https://${app.slug}.${baseDomain}`
    this.createdAt = app.createdAt.toISOString()
    this.updatedAt = app.updatedAt.toISOString()
  }
}

export class ViewAppIndexResponseMeta extends PaginatedKeysetResponseMeta {
  @ApiProperty({ type: ViewAppIndexQueryKey, nullable: true })
  declare readonly next: ViewAppIndexQueryKey | null

  constructor(apps: App[]) {
    super(ViewAppIndexQueryKey.nextKey(apps))
  }
}

export class ViewAppIndexResponse extends PaginatedKeysetResponse<AppSummary> {
  @ApiProperty({ type: [AppSummary] })
  declare readonly items: AppSummary[]

  // Redeclared so OpenAPI names this use-case's meta instead of inheriting the
  // base's schema-less one — that is what gives the cursor a generated type on
  // the client rather than an opaque record.
  @ApiProperty({ type: ViewAppIndexResponseMeta })
  declare readonly meta: ViewAppIndexResponseMeta

  constructor(apps: App[], baseDomain: string) {
    super(
      apps.map((app) => new AppSummary(app, baseDomain)),
      new ViewAppIndexResponseMeta(apps),
    )
  }
}
