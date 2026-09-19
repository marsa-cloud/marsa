import { ApiProperty } from '@nestjs/swagger'
import type { Release } from '#src/app/release/entities/release.table.js'
import { DeployStatus, DeployStatusApiProperty } from '#src/app/release/enums/deploy-status.enum.js'

export class DeployReleaseResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly releaseUuid: string

  @ApiProperty({ type: String, example: 'my-app' })
  readonly appSlug: string

  @ApiProperty({ type: String, example: 'https://my-app.demo.marsa.cc' })
  readonly url: string

  @DeployStatusApiProperty()
  readonly deployStatus: DeployStatus

  constructor(slug: string, release: Release, baseDomain: string) {
    this.releaseUuid = release.uuid
    this.appSlug = slug
    this.url = `https://${slug}.${baseDomain}`
    this.deployStatus = release.deployStatus
  }
}
