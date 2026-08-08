import { ApiProperty } from '@nestjs/swagger'
import type { App } from '#src/app/app-management/entities/app.table.js'

/**
 * The stored env after the write. `redeployRequired` is always true on a
 * successful update: the running container keeps its old environment until a
 * new Release rolls out, so the client has to prompt for a redeploy.
 */
export class UpdateAppEnvResponse {
  @ApiProperty({ type: String, example: 'my-app' })
  readonly slug: string

  @ApiProperty({
    type: Object,
    additionalProperties: { type: 'string' },
    example: { LOG_LEVEL: 'info' },
  })
  readonly env: Record<string, string>

  @ApiProperty({
    type: Boolean,
    example: true,
    description: 'The stored env now differs from the running container until the app redeploys.',
  })
  readonly redeployRequired: boolean

  constructor(app: App) {
    this.slug = app.slug
    this.env = app.env
    this.redeployRequired = true
  }
}
