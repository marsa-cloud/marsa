import { ApiProperty } from '@nestjs/swagger'
import { NodePin } from '#src/app/app-management/entities/node-pin.js'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import { AppLatestBuild } from '#src/app/app-management/responses/app-latest-build.response.js'
import {
  AppEnvironmentRef,
  AppProjectRef,
} from '#src/app/app-management/responses/app-placement.response.js'
import { AppSourceResponse } from '#src/app/app-management/responses/app-source.response.js'
import type { Build } from '#src/app/build/entities/build.table.js'

export class ViewAppDetailResponse {
  @ApiProperty({ type: String, example: 'my-app' })
  readonly slug: string

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'nginx:1.27',
    description: 'Image the next release uses. Null until a source app finishes its first build.',
  })
  readonly image: string | null

  @ApiProperty({ type: String, example: 'https://my-app.demo.marsa.cc' })
  readonly url: string

  @ApiProperty({ type: AppProjectRef })
  readonly project: AppProjectRef

  @ApiProperty({ type: AppEnvironmentRef })
  readonly environment: AppEnvironmentRef

  @ApiProperty({ type: 'integer', example: 80 })
  readonly containerPort: number

  @ApiProperty({ type: 'integer', example: 1, description: '0 means the app sleeps when idle.' })
  readonly minReplicas: number

  @ApiProperty({ type: 'integer', example: 1 })
  readonly maxReplicas: number

  @ApiProperty({
    type: Object,
    additionalProperties: { type: 'string' },
    example: { LOG_LEVEL: 'info' },
    description: 'Saved environment variables.',
  })
  readonly env: Record<string, string>

  @ApiProperty({
    type: NodePin,
    nullable: true,
    description: 'Nodes this app is restricted to; null schedules anywhere.',
  })
  readonly nodePin: NodePin | null

  @ApiProperty({
    type: AppSourceResponse,
    nullable: true,
    description: 'GitHub repo the app builds from; null for an image app.',
  })
  readonly source: AppSourceResponse | null

  @ApiProperty({ type: AppLatestBuild, nullable: true, description: 'Newest build, if any.' })
  readonly latestBuild: AppLatestBuild | null

  @ApiProperty({
    type: Boolean,
    description:
      'True when the saved config differs from the release the cluster is running, or nothing is running.',
  })
  readonly hasUndeployedChanges: boolean

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt: string

  constructor(
    { app, project, environment }: AppPlacement,
    baseDomain: string,
    hasUndeployedChanges: boolean,
    latestBuild: Build | undefined,
  ) {
    this.slug = app.slug
    this.image = app.image
    this.url = `https://${app.slug}.${baseDomain}`
    this.project = new AppProjectRef(project)
    this.environment = new AppEnvironmentRef(environment)
    this.containerPort = app.containerPort
    this.minReplicas = app.minReplicas
    this.maxReplicas = app.maxReplicas
    this.env = app.env
    this.nodePin = app.nodePin
    this.source = app.source ? new AppSourceResponse(app.source) : null
    this.latestBuild = latestBuild ? new AppLatestBuild(latestBuild) : null
    this.hasUndeployedChanges = hasUndeployedChanges
    this.createdAt = app.createdAt.toISOString()
    this.updatedAt = app.updatedAt.toISOString()
  }
}
