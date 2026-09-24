import { ApiProperty } from '@nestjs/swagger'
import { envPrefixOf } from '#src/app/database-management/entities/attachment-env.js'
import { catalogueEntry } from '#src/app/database-management/catalogue/engine-catalogue.js'
import {
  DatabaseEngine,
  DatabaseEngineApiProperty,
} from '#src/app/database-management/enums/database-engine.enum.js'
import type { AttachedDatabase } from '#src/app/database-management/queries/app-attachments.js'

export class AppAttachmentSummary {
  @ApiProperty({ type: String, example: 'orders' })
  readonly databaseSlug: string

  @ApiProperty({ type: String, nullable: true, example: 'analytics' })
  readonly alias: string | null

  @DatabaseEngineApiProperty({ example: DatabaseEngine.Postgres })
  readonly engine: DatabaseEngine

  @ApiProperty({ type: String, example: '17' })
  readonly version: string

  @ApiProperty({
    type: [String],
    example: ['DATABASE_URL', 'PGHOST'],
    description: 'Variable names this attachment injects into the app.',
  })
  readonly variables: string[]

  constructor(attachment: AttachedDatabase) {
    this.databaseSlug = attachment.databaseSlug
    this.alias = attachment.alias
    this.engine = attachment.engine
    this.version = attachment.version

    const entry = catalogueEntry(attachment.engine, attachment.version)
    const prefix = envPrefixOf(attachment.alias) ?? ''
    this.variables = (entry?.publishedKeys ?? []).map((key) => `${prefix}${key}`)
  }
}

export class ViewAppAttachmentIndexResponse {
  @ApiProperty({ type: [AppAttachmentSummary] })
  readonly items: AppAttachmentSummary[]

  constructor(attachments: AttachedDatabase[]) {
    this.items = attachments.map((attachment) => new AppAttachmentSummary(attachment))
  }
}
