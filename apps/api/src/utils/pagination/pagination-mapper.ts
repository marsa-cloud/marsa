import type { PaginatedOffsetQuery } from '#src/utils/pagination/offset/paginated-offset.query.js'

export const DEFAULT_PAGINATION_MAX_LIMIT = 100

// FindOptions takes limit/offset directly, so this maps nothing — it exists to
// clamp the limit and supply fallbacks when the query object is absent.
export interface MikroormPagination {
  limit: number
  offset: number
}

export function mikroormPagination(
  query?: PaginatedOffsetQuery | null,
  maxLimit = DEFAULT_PAGINATION_MAX_LIMIT,
): MikroormPagination {
  const limit = Math.min(query?.limit ?? maxLimit, maxLimit)
  const offset = query?.offset ?? 0

  return { limit, offset }
}
