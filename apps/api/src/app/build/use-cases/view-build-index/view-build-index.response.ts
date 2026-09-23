import { ApiProperty } from '@nestjs/swagger'
import type { Build } from '#src/app/build/entities/build.table.js'
import { BuildSummary } from '#src/app/build/responses/build-summary.response.js'
import { ViewBuildIndexQueryKey } from '#src/app/build/use-cases/view-build-index/query/view-build-index.query.js'
import {
  PaginatedKeysetResponse,
  PaginatedKeysetResponseMeta,
} from '#src/utils/pagination/keyset/paginated-keyset.response.js'

export class ViewBuildIndexResponseMeta extends PaginatedKeysetResponseMeta {
  @ApiProperty({ type: ViewBuildIndexQueryKey, nullable: true })
  declare readonly next: ViewBuildIndexQueryKey | null

  constructor(builds: Build[]) {
    super(ViewBuildIndexQueryKey.nextKey(builds))
  }
}

export class ViewBuildIndexResponse extends PaginatedKeysetResponse<BuildSummary> {
  @ApiProperty({ type: [BuildSummary] })
  declare readonly items: BuildSummary[]

  @ApiProperty({ type: ViewBuildIndexResponseMeta })
  declare readonly meta: ViewBuildIndexResponseMeta

  constructor(builds: Build[]) {
    super(
      builds.map((build) => new BuildSummary(build)),
      new ViewBuildIndexResponseMeta(builds),
    )
  }
}
