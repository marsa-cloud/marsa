import { ApiProperty } from '@nestjs/swagger'

export class PaginatedOffsetResponseMeta {
  @ApiProperty({
    type: 'integer',
    description: 'Total rows matching the query, ignoring limit/offset.',
  })
  readonly total: number

  @ApiProperty({ type: 'integer', description: 'Offset applied to this page.' })
  readonly offset: number

  @ApiProperty({ type: 'integer', description: 'Limit applied to this page.' })
  readonly limit: number

  constructor(total: number, offset: number, limit: number) {
    this.total = total
    this.offset = offset
    this.limit = limit
  }
}
