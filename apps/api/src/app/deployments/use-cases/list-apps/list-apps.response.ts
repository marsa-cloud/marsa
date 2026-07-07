import { ApiProperty } from '@nestjs/swagger'

import type { App } from '#src/app/deployments/entities/app.entity.js'
import type { Release } from '#src/app/deployments/entities/release.entity.js'
import {
  DeployStatus,
  DeployStatusApiProperty,
} from '#src/app/deployments/enums/deploy-status.enum.js'

export class AppSummary {
  @ApiProperty({ type: String, example: 'my-app' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'nginx:1.27' })
  readonly image: string

  @ApiProperty({ type: String, example: 'https://my-app.demo.marsa.cc' })
  readonly url: string

  @DeployStatusApiProperty({
    example: DeployStatus.Succeeded,
    description: 'Current deploy status — the newest release’s stored status (not a live read).',
  })
  readonly deployStatus: DeployStatus

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt: string

  constructor(app: App, latestRelease: Release | null, baseDomain: string) {
    this.slug = app.slug
    this.image = app.image
    this.url = `https://${app.slug}.${baseDomain}`
    // Every app is created together with its first Release (deploy-app is
    // transactional), so `latestRelease` is effectively always present; the
    // `Pending` fallback guards a would-be orphan app defensively.
    this.deployStatus = latestRelease?.deployStatus ?? DeployStatus.Pending
    this.createdAt = app.createdAt.toISOString()
    this.updatedAt = app.updatedAt.toISOString()
  }
}

export class ListAppsResponse {
  @ApiProperty({ type: [AppSummary] })
  readonly apps: AppSummary[]

  constructor(rows: { app: App; latestRelease: Release | null }[], baseDomain: string) {
    this.apps = rows.map(({ app, latestRelease }) => new AppSummary(app, latestRelease, baseDomain))
  }
}
