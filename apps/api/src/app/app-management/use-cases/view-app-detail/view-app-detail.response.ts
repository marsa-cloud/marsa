import { ApiProperty } from '@nestjs/swagger'
import type { App } from '#src/app/app-management/entities/app.table.js'

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
    description:
      'Stored environment variables; may differ from the running container until the app is redeployed.',
  })
  readonly env: Record<string, string>

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt: string

  constructor(app: App, baseDomain: string) {
    this.slug = app.slug
    this.image = app.image
    this.url = `https://${app.slug}.${baseDomain}`
    this.containerPort = app.containerPort
    this.minReplicas = app.minReplicas
    this.maxReplicas = app.maxReplicas
    this.env = app.env
    this.createdAt = app.createdAt.toISOString()
    this.updatedAt = app.updatedAt.toISOString()
  }
}
