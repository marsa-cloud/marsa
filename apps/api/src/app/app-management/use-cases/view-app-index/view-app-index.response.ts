import { ApiProperty } from '@nestjs/swagger'
import type { App } from '#src/app/app-management/entities/app.entity.js'

export class AppSummary {
  @ApiProperty({ type: String, example: 'my-app' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'nginx:1.27' })
  readonly image: string

  @ApiProperty({ type: String, example: 'https://my-app.demo.marsa.cc' })
  readonly url: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt: string

  constructor(app: App, baseDomain: string) {
    this.slug = app.slug
    this.image = app.image
    this.url = `https://${app.slug}.${baseDomain}`
    this.createdAt = app.createdAt.toISOString()
    this.updatedAt = app.updatedAt.toISOString()
  }
}

export class ViewAppIndexResponse {
  @ApiProperty({ type: [AppSummary] })
  readonly apps: AppSummary[]

  constructor(apps: App[], baseDomain: string) {
    this.apps = apps.map((app) => new AppSummary(app, baseDomain))
  }
}
