import { ApiProperty } from '@nestjs/swagger'
import type { App } from '#src/app/app-management/entities/app.table.js'

export class CreateAppResponse {
  @ApiProperty({ type: String, example: 'my-app' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'https://my-app.demo.marsa.cc' })
  readonly url: string

  constructor(app: App, baseDomain: string) {
    this.slug = app.slug
    this.url = `https://${app.slug}.${baseDomain}`
  }
}
