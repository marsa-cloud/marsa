import { ApiProperty } from '@nestjs/swagger'
import type { Build } from '#src/app/build/entities/build.table.js'
import { BuildStatus, BuildStatusApiProperty } from '#src/app/build/enums/build-status.enum.js'

export class AppLatestBuild {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly uuid: string

  @BuildStatusApiProperty({ example: BuildStatus.Running })
  readonly status: BuildStatus

  @ApiProperty({ type: String, example: 'c0ffee0000000000000000000000000000000000' })
  readonly commitSha: string

  @ApiProperty({ type: String, nullable: true })
  readonly failureReason: string | null

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  constructor(build: Build) {
    this.uuid = build.uuid
    this.status = build.status
    this.commitSha = build.commitSha
    this.failureReason = build.failureReason
    this.createdAt = build.createdAt.toISOString()
  }
}
