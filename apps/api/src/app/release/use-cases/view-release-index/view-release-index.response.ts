import { ApiProperty } from '@nestjs/swagger'
import type { Release } from '#src/app/release/entities/release.entity.js'
import { DeployStatus, DeployStatusApiProperty } from '#src/app/release/enums/deploy-status.enum.js'
import { ReleaseTrigger } from '#src/app/release/enums/release-trigger.enum.js'
import type { DeployFailure } from '#src/modules/kubernetes/deploy-backend.types.js'

export class ReleaseSummary {
  @ApiProperty({ type: String, example: '00000000-0000-0000-0000-000000000000' })
  readonly uuid: string

  @ApiProperty({ type: String, example: 'nginx:1.27' })
  readonly imageRef: string

  @ApiProperty({ enum: ReleaseTrigger, enumName: 'ReleaseTrigger', example: ReleaseTrigger.Manual })
  readonly triggeredBy: ReleaseTrigger

  @DeployStatusApiProperty({ example: DeployStatus.Succeeded })
  readonly deployStatus: DeployStatus

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
    this.createdAt = release.createdAt.toISOString()
    this.updatedAt = release.updatedAt.toISOString()
    if (failure) {
      this.failureReason = failure.reason
      this.failureMessage = failure.message
    }
  }
}

export class ViewReleaseIndexResponse {
  @ApiProperty({ type: [ReleaseSummary] })
  readonly releases: ReleaseSummary[]

  /**
   * `headFailure` (when present) is attached to the newest release only — it's
   * the sole release that maps to the live Deployment, so a failure reason read
   * from the cluster can only be about it.
   */
  constructor(releases: Release[], headFailure?: DeployFailure | null) {
    this.releases = releases.map(
      (release, index) => new ReleaseSummary(release, index === 0 ? headFailure : undefined),
    )
  }
}
