import { ApiProperty } from '@nestjs/swagger'
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import { ReleaseTrigger } from '#src/app/release/enums/release-trigger.enum.js'

export class CreateReleaseResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly releaseUuid: string

  @ApiProperty({ type: String, example: 'my-app' })
  readonly appSlug: string

  @ApiProperty({ enum: ReleaseTrigger, enumName: 'ReleaseTrigger' })
  readonly triggeredBy: ReleaseTrigger

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  readonly sourceReleaseUuid: string | null

  constructor(app: App, release: Release) {
    this.releaseUuid = release.uuid
    this.appSlug = app.slug
    this.triggeredBy = release.triggeredBy
    this.sourceReleaseUuid = release.sourceReleaseUuid
  }
}
