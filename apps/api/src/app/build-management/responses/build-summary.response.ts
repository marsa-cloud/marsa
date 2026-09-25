import { ApiProperty } from '@nestjs/swagger'
import type { Build } from '#src/app/build-management/entities/build.table.js'
import {
  BuildStatus,
  BuildStatusApiProperty,
} from '#src/app/build-management/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build-management/enums/build-trigger.enum.js'

export class BuildSummary {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly uuid: string

  @ApiProperty({ type: String, example: 'c0ffee0000000000000000000000000000000000' })
  readonly commitSha: string

  @ApiProperty({ type: String, example: 'main' })
  readonly branch: string

  @BuildStatusApiProperty({ example: BuildStatus.Succeeded })
  readonly status: BuildStatus

  @ApiProperty({ enum: BuildTrigger, enumName: 'BuildTrigger', example: BuildTrigger.Push })
  readonly trigger: BuildTrigger

  @ApiProperty({ type: String, nullable: true, description: 'Set once the build succeeds.' })
  readonly imageRef: string | null

  @ApiProperty({ type: String, nullable: true, description: 'Why the build failed.' })
  readonly failureReason: string | null

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt: string

  constructor(build: Build) {
    this.uuid = build.uuid
    this.commitSha = build.commitSha
    this.branch = build.branch
    this.status = build.status
    this.trigger = build.trigger
    this.imageRef = build.imageRef
    this.failureReason = build.failureReason
    this.createdAt = build.createdAt.toISOString()
    this.updatedAt = build.updatedAt.toISOString()
  }
}
