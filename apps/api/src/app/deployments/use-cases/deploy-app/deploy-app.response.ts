import { ApiProperty } from '@nestjs/swagger'

import type { App } from '#src/app/deployments/entities/app.entity.js'
import type { Release } from '#src/app/deployments/entities/release.entity.js'
import { DeployStatus } from '#src/app/deployments/enums/deploy-status.enum.js'

export class DeployAppResponse {
  @ApiProperty({ type: String, example: 'my-app' })
  readonly appSlug: string

  @ApiProperty({ type: String, example: 'https://my-app.demo.marsa.cc' })
  readonly url: string

  @ApiProperty({
    type: String,
    example: '00000000-0000-0000-0000-000000000000',
    description: 'The Release created for this deploy.',
  })
  readonly releaseUuid: string

  @ApiProperty({ enum: DeployStatus, enumName: 'DeployStatus', example: DeployStatus.Succeeded })
  readonly deployStatus: DeployStatus

  constructor(app: App, release: Release, baseDomain: string) {
    this.appSlug = app.slug
    this.url = `https://${app.slug}.${baseDomain}`
    this.releaseUuid = release.uuid
    this.deployStatus = release.deployStatus
  }
}
