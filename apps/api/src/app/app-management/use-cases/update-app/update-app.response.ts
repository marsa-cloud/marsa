import { ApiProperty } from '@nestjs/swagger'
import type { App } from '#src/app/app-management/entities/app.table.js'
import { NodePin } from '#src/app/app-management/entities/node-pin.js'

export class UpdateAppResponse {
  @ApiProperty({ type: String, example: 'my-app' })
  readonly slug: string

  @ApiProperty({ type: String, example: 'nginx:1.27' })
  readonly image: string

  @ApiProperty({ type: 'integer', example: 80 })
  readonly containerPort: number

  @ApiProperty({ type: 'integer', example: 1 })
  readonly minReplicas: number

  @ApiProperty({ type: 'integer', example: 1 })
  readonly maxReplicas: number

  @ApiProperty({ type: Object, additionalProperties: { type: 'string' }, example: { A: '1' } })
  readonly env: Record<string, string>

  @ApiProperty({ type: NodePin, nullable: true })
  readonly nodePin: NodePin | null

  constructor(app: App) {
    this.slug = app.slug
    this.image = app.image
    this.containerPort = app.containerPort
    this.minReplicas = app.minReplicas
    this.maxReplicas = app.maxReplicas
    this.env = app.env
    this.nodePin = app.nodePin
  }
}
