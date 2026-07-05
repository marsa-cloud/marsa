import { ApiProperty } from '@nestjs/swagger'

import type { Release } from '#src/app/deployments/entities/release.entity.js'
import {
  DeployStatus,
  DeployStatusApiProperty,
} from '#src/app/deployments/enums/deploy-status.enum.js'
import { ReleaseTrigger } from '#src/app/deployments/enums/release-trigger.enum.js'

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

  constructor(release: Release) {
    this.uuid = release.uuid
    this.imageRef = release.imageRef
    this.triggeredBy = release.triggeredBy
    this.deployStatus = release.deployStatus
    this.createdAt = release.createdAt.toISOString()
    this.updatedAt = release.updatedAt.toISOString()
  }
}

export class ListAppReleasesResponse {
  @ApiProperty({ type: [ReleaseSummary] })
  readonly releases: ReleaseSummary[]

  constructor(releases: Release[]) {
    this.releases = releases.map((release) => new ReleaseSummary(release))
  }
}
