import { ApiProperty } from '@nestjs/swagger'
import type { Release } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import { DeployStatus, DeployStatusApiProperty } from '#src/app/release/enums/deploy-status.enum.js'
import { ReleaseTrigger } from '#src/app/release/enums/release-trigger.enum.js'
import { ViewReleaseIndexQueryKey } from '#src/app/release/use-cases/view-release-index/query/view-release-index.query.js'
import type { DeployFailure } from '#src/modules/runtime/runtime.types.js'
import {
  PaginatedKeysetResponse,
  PaginatedKeysetResponseMeta,
} from '#src/utils/pagination/keyset/paginated-keyset.response.js'

export class ReleaseSummary {
  @ApiProperty({ type: String, example: '00000000-0000-0000-0000-000000000000' })
  readonly uuid: string

  @ApiProperty({ type: String, example: 'nginx:1.27' })
  readonly imageRef: string

  @ApiProperty({ enum: ReleaseTrigger, enumName: 'ReleaseTrigger', example: ReleaseTrigger.Manual })
  readonly triggeredBy: ReleaseTrigger

  @DeployStatusApiProperty({ example: DeployStatus.Succeeded })
  readonly deployStatus: DeployStatus

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Set on a rollback.' })
  readonly sourceReleaseUuid: string | null

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt: string

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    description: 'Why the deploy failed (live-derived, only on a failed release).',
    example: 'ImagePullBackOff',
  })
  readonly failureReason?: string

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    example: 'Back-off pulling image "nginx:doesnotexist"',
  })
  readonly failureMessage?: string

  constructor(release: Release, failure?: DeployFailure | null) {
    this.uuid = release.uuid
    this.imageRef = release.imageRef
    this.triggeredBy = release.triggeredBy
    this.deployStatus = release.deployStatus
    this.sourceReleaseUuid = release.sourceReleaseUuid
    this.createdAt = release.createdAt.toISOString()
    this.updatedAt = release.updatedAt.toISOString()
    if (failure) {
      this.failureReason = failure.reason
      this.failureMessage = failure.message
    }
  }
}

export interface ReleaseHead {
  readonly uuid: ReleaseUuid
  readonly deployStatus: DeployStatus
  readonly failure: DeployFailure | null
}

export class ViewReleaseIndexResponseMeta extends PaginatedKeysetResponseMeta {
  @ApiProperty({ type: ViewReleaseIndexQueryKey, nullable: true })
  declare readonly next: ViewReleaseIndexQueryKey | null

  constructor(releases: Release[]) {
    super(ViewReleaseIndexQueryKey.nextKey(releases))
  }
}

export class ViewReleaseIndexResponse extends PaginatedKeysetResponse<ReleaseSummary> {
  @ApiProperty({ type: [ReleaseSummary] })
  declare readonly items: ReleaseSummary[]

  @ApiProperty({ type: ViewReleaseIndexResponseMeta })
  declare readonly meta: ViewReleaseIndexResponseMeta

  constructor(releases: Release[], head?: ReleaseHead | null) {
    super(
      releases.map((release) =>
        head && head.uuid === release.uuid
          ? new ReleaseSummary({ ...release, deployStatus: head.deployStatus }, head.failure)
          : new ReleaseSummary(release),
      ),
      new ViewReleaseIndexResponseMeta(releases),
    )
  }
}
