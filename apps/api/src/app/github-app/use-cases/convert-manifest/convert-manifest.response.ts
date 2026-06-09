import { ApiProperty } from '@nestjs/swagger'

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

  constructor(appSlug: string, appName: string, htmlUrl: string, installUrl: string) {
    this.appSlug = appSlug
    this.appName = appName
    this.htmlUrl = htmlUrl
    this.installUrl = installUrl
  }
}
