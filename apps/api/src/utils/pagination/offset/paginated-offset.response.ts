import { ApiProperty } from '@nestjs/swagger'
import { PaginatedOffsetResponseMeta } from '#src/utils/pagination/offset/paginated-offset-response-meta.js'

// Generic offset page. `T` is erased at runtime, so an adopting use-case
// subclasses this and redeclares `items` with `@ApiProperty({ type: [ItemDto] })`
// to give OpenAPI a named item schema.
export class PaginatedOffsetResponse<T> {
  readonly items: T[]

  @ApiProperty({ type: PaginatedOffsetResponseMeta })
  readonly meta: PaginatedOffsetResponseMeta

  constructor(items: T[], meta: PaginatedOffsetResponseMeta) {
    this.items = items
    this.meta = meta
  }
}
