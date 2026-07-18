import { ApiProperty } from '@nestjs/swagger'

export class PaginatedKeysetResponseMeta {
  @ApiProperty({
    type: 'string',
    nullable: true,
    description: 'Cursor for the next page, or null on the last page.',
  })
  readonly nextCursor: string | null

  @ApiProperty({ type: 'boolean', description: 'Whether more rows exist after this page.' })
  readonly hasMore: boolean

  @ApiProperty({ type: 'integer', description: 'Limit applied to this page.' })
  readonly limit: number

  constructor(nextCursor: string | null, hasMore: boolean, limit: number) {
    this.nextCursor = nextCursor
    this.hasMore = hasMore
    this.limit = limit
  }
}
