import { ApiProperty } from '@nestjs/swagger'

export class PaginatedKeysetResponseMeta {
  // Deliberately untyped in the schema: the key is opaque to the client, which
  // only ever echoes it back. The implementor decides whether it carries an
  // encoded string or a structured object.
  @ApiProperty({
    nullable: true,
    description: 'Key for the next page, or null on the last page. Opaque — send it back as-is.',
  })
  readonly next: string | object | null

  constructor(next: string | object | null) {
    this.next = next
  }
}

// `T` is erased at runtime, so an adopting use-case subclasses this and
// redeclares `items` with @ApiProperty({ type: [ItemDto] }) to give OpenAPI a
// named item schema.
export class PaginatedKeysetResponse<T> {
  @ApiProperty({ description: 'The items for the current page', isArray: true })
  readonly items: T[]

  @ApiProperty({ type: PaginatedKeysetResponseMeta })
  readonly meta: PaginatedKeysetResponseMeta

  constructor(items: T[], meta: PaginatedKeysetResponseMeta) {
    this.items = items
    this.meta = meta
  }
}
