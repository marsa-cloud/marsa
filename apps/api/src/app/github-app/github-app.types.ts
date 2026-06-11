import { ApiProperty } from '@nestjs/swagger'

export class HookAttributesDto {
  @ApiProperty({ type: String, description: 'Webhook delivery URL.' })
  readonly url: string

  constructor(url: string) {
    this.url = url
  }
}

/**
 * The GitHub App manifest the FE posts to GitHub to create the App. snake_case
 * keys follow GitHub's manifest schema (not our convention). The permission
 * baseline is a tunable default sized for #22/#23 — see AgDR-0006.
 * @see https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
 */
export class ManifestDto {
  @ApiProperty({ type: String })
  readonly name: string

  @ApiProperty({ type: String })
  readonly url: string

  @ApiProperty({ type: HookAttributesDto })
  readonly hook_attributes: HookAttributesDto

  @ApiProperty({ type: String })
  readonly redirect_url: string

  @ApiProperty({ type: [String] })
  readonly callback_urls: string[]

  @ApiProperty({ type: Boolean })
  readonly public: boolean

  @ApiProperty({ type: Boolean })
  readonly request_oauth_on_install: boolean

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  readonly default_permissions: Record<string, string>

  @ApiProperty({ type: [String] })
  readonly default_events: string[]

  constructor(params: {
    name: string
    url: string
    webhookUrl: string
    redirectUrl: string
    oauthCallbackUrl: string
  }) {
    this.name = params.name
    this.url = params.url
    this.hook_attributes = new HookAttributesDto(params.webhookUrl)
    this.redirect_url = params.redirectUrl
    this.callback_urls = [params.oauthCallbackUrl]
    this.public = false
    this.request_oauth_on_install = true
    this.default_permissions = { contents: 'read', metadata: 'read' }
    this.default_events = ['push']
  }
}
