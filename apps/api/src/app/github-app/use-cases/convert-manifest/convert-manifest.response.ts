import { ApiProperty } from '@nestjs/swagger'

import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'

export class ConvertManifestResponse {
  @ApiProperty({ type: String, example: 'marsa-demo-marsa-cc' })
  readonly appSlug: string

  @ApiProperty({ type: String, example: 'marsa-demo.marsa.cc' })
  readonly appName: string

  @ApiProperty({ type: String, example: 'https://github.com/apps/marsa-demo-marsa-cc' })
  readonly htmlUrl: string

  @ApiProperty({
    type: String,
    description: 'Where the operator installs the App on their repos (#23).',
    example: 'https://github.com/apps/marsa-demo-marsa-cc/installations/new',
  })
  readonly installUrl: string

  constructor(app: GitHubApp) {
    this.appSlug = app.slug
    this.appName = app.name
    this.htmlUrl = app.htmlUrl
    this.installUrl = `${app.htmlUrl}/installations/new`
  }
}
