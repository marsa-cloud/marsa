import { type CursorPayload } from '#src/utils/pagination/keyset/cursor.js'
import { SortDirection } from '#src/utils/pagination/search/sort-direction.js'

// Which comparison advances past the cursor for a given sort direction. Spelled
// ORM-neutrally (not `$lt`/`$gt`) so this seam carries no query-language dialect.
export type ComparisonOperator = 'lt' | 'gt'

// ORM-agnostic descriptor of the keyset "seek past the cursor" predicate:
//   sortField <op> sortValue OR (sortField = sortValue AND idField <op> id)
// The adopting repository translates this into its ORM's WHERE (MikroORM $or,
// Drizzle, …), keeping the ORM-specific syntax the only thing a repo writes.
//
// `orderBy` states the ordering the predicate presupposes. Keyset is only correct
// when the query's ORDER BY matches it exactly — both columns, same direction —
// so it travels with the descriptor rather than being re-derived at each call
// site, where a mismatch would silently drop or repeat rows.
export interface KeysetComparison {
  readonly sortField: string
  readonly idField: string
  readonly operator: ComparisonOperator
  readonly sortValue: string | number
  readonly id: string
  readonly orderBy: ReadonlyArray<readonly [field: string, direction: SortDirection]>
}

export function keysetComparison(
  sortField: string,
  idField: string,
  order: SortDirection,
  cursor: CursorPayload,
): KeysetComparison {
  return {
    sortField,
    idField,
    operator: order === SortDirection.ASC ? 'gt' : 'lt',
    sortValue: cursor.sortValue,
    id: cursor.id,
    orderBy: [
      [sortField, order],
      [idField, order],
    ],
  }
}
