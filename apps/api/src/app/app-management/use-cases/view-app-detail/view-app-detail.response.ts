import { ApiProperty } from '@nestjs/swagger'
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { Release } from '#src/app/release/entities/release.table.js'
import { isSnapshotOf } from '#src/app/release/entities/release-snapshot.js'

export class ViewAppDetailResponse {
  @ApiProperty({ type: String, example: 'my-app' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'nginx:1.27' })
  readonly image: string

  @ApiProperty({ type: String, example: 'https://my-app.demo.marsa.cc' })
  readonly url: string

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
    type: Boolean,
    description:
      'True when the saved config has never been released or differs from the newest release.',
  })
  readonly hasUndeployedChanges: boolean

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt: string

  constructor(app: App, baseDomain: string, newest?: Release) {
    this.slug = app.slug
    this.image = app.image
    this.url = `https://${app.slug}.${baseDomain}`
    this.containerPort = app.containerPort
    this.minReplicas = app.minReplicas
    this.maxReplicas = app.maxReplicas
    this.env = app.env
    this.hasUndeployedChanges = !newest || !isSnapshotOf(newest, app)
    this.createdAt = app.createdAt.toISOString()
    this.updatedAt = app.updatedAt.toISOString()
  }
}
