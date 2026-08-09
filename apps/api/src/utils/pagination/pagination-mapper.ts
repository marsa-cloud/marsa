import type { PaginatedKeysetQuery } from '#src/utils/pagination/keyset/paginated-keyset.query.js'
import type { PaginatedOffsetQuery } from '#src/utils/pagination/offset/paginated-offset.query.js'

export const DEFAULT_PAGINATION_MAX_LIMIT = 100

// The query builder takes limit/offset directly, so this maps nothing — it
// exists to clamp the limit and supply fallbacks when the query object is absent.
export interface OffsetPagination {
  limit: number
  offset: number
}

// Bounds BOTH ends. The DTO validators already reject out-of-range input on the
// HTTP path, so this guards the other caller: code constructing a query object
// directly. A limit of 0, a negative offset or a NaN would otherwise reach the
// driver and throw there ("LIMIT must not be negative") rather than here.
export function offsetPagination(
  query?: PaginatedOffsetQuery | null,
  maxLimit = DEFAULT_PAGINATION_MAX_LIMIT,
): OffsetPagination {
  const ceiling = Math.max(Math.trunc(toFinite(maxLimit, DEFAULT_PAGINATION_MAX_LIMIT)), 1)
  const requested = Math.trunc(toFinite(query?.limit, ceiling))
  const offset = Math.trunc(toFinite(query?.offset, 0))

  return {
    limit: Math.min(Math.max(requested, 1), ceiling),
    offset: Math.max(offset, 0),
  }
}

/**
 * Page size for a keyset seek. Same reason the offset mapper exists: the DTO's
 * `@Max` only guards the HTTP path, so a query object built in code could
 * otherwise send a 0, a negative, or a NaN to the driver.
 */
export function keysetLimit(
  pagination?: PaginatedKeysetQuery | null,
  maxLimit = DEFAULT_PAGINATION_MAX_LIMIT,
): number {
  const ceiling = Math.max(Math.trunc(toFinite(maxLimit, DEFAULT_PAGINATION_MAX_LIMIT)), 1)
  const requested = Math.trunc(toFinite(pagination?.limit, ceiling))
  return Math.min(Math.max(requested, 1), ceiling)
}

function toFinite(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
