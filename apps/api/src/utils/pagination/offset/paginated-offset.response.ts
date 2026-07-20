import { ApiProperty } from '@nestjs/swagger'

export class PaginatedOffsetResponseMeta {
  @ApiProperty({ description: 'the total amount of items that exist' })
  total: number

  @ApiProperty({ description: 'the amount of items skipped' })
  offset: number

  @ApiProperty({ description: 'the amount of items per response' })
  limit: number

  constructor(total: number, offset: number, limit: number) {
    this.total = total
    this.offset = offset
    this.limit = limit
  }
}

export class PaginatedOffsetResponse<T> {
  @ApiProperty({ description: 'The items for the current page', isArray: true })
  items: T[]

  @ApiProperty({ type: PaginatedOffsetResponseMeta })
  meta: PaginatedOffsetResponseMeta

  // Takes a meta instance rather than loose numbers: three positional numbers
  // in a different order from the meta constructor made a silent transposition
  // type-check, and no test downstream would have caught the swap.
  constructor(items: T[], meta: PaginatedOffsetResponseMeta) {
    this.items = items
    this.meta = meta
  }
}
