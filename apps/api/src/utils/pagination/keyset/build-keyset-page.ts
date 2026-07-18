import { type CursorPayload, encodeCursor } from '#src/utils/pagination/keyset/cursor.js'
import { PaginatedKeysetResponseMeta } from '#src/utils/pagination/keyset/paginated-keyset-response-meta.js'

export interface KeysetPage<T> {
  readonly items: T[]
  readonly meta: PaginatedKeysetResponseMeta
}

// Assembles a keyset page from an OVER-FETCHED row set.
//
// The caller queries `limit + 1` rows: the extra row is how we know another page
// exists without a second COUNT. This function drops it, so `nextCursor` is built
// from the last row we actually RETURN — not the last row fetched. Getting that
// wrong skips a row at every page boundary, which is the classic keyset bug and
// the reason this lives here once instead of in each adopting repository.
export function buildKeysetPage<T>(
  rows: readonly T[],
  limit: number,
  toCursor: (row: T) => CursorPayload,
): KeysetPage<T> {
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : [...rows]
  const last = items.at(-1)
  const nextCursor = hasMore && last !== undefined ? encodeCursor(toCursor(last)) : null

  return { items, meta: new PaginatedKeysetResponseMeta(nextCursor, hasMore, limit) }
}
