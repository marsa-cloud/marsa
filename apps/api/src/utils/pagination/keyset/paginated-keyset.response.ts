import { ApiProperty } from '@nestjs/swagger'
import { PaginatedKeysetResponseMeta } from '#src/utils/pagination/keyset/paginated-keyset-response-meta.js'

// Generic keyset page. `T` is erased at runtime, so an adopting use-case
// subclasses this and redeclares `items` with `@ApiProperty({ type: [ItemDto] })`.
export class PaginatedKeysetResponse<T> {
  readonly items: T[]

  @ApiProperty({ type: PaginatedKeysetResponseMeta })
  readonly meta: PaginatedKeysetResponseMeta

  constructor(items: T[], meta: PaginatedKeysetResponseMeta) {
    this.items = items
    this.meta = meta
  }
}
