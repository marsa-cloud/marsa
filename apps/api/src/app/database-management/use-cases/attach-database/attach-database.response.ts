import { ApiProperty } from '@nestjs/swagger'

export class AttachDatabaseResponse {
  @ApiProperty({ type: String, example: 'orders' })
  readonly databaseSlug: string

  @ApiProperty({ type: String, nullable: true, example: 'analytics' })
  readonly alias: string | null

  @ApiProperty({
    type: [String],
    example: ['DATABASE_URL', 'PGHOST'],
    description: 'Variable names this attachment injects into the app.',
  })
  readonly variables: string[]

  constructor(databaseSlug: string, alias: string | null, variables: string[]) {
    this.databaseSlug = databaseSlug
    this.alias = alias
    this.variables = variables
  }
}
