import { type CursorPayload } from '#src/utils/pagination/keyset/cursor.js'
import { SortDirection } from '#src/utils/pagination/search/sort-direction.js'

// Which comparison operator advances past the cursor for a given sort direction.
export type ComparisonOperator = '$lt' | '$gt'

// ORM-agnostic descriptor of the keyset "seek past the cursor" predicate:
//   sortField <op> sortValue OR (sortField = sortValue AND idField <op> id)
// The adopting repository translates this into its ORM's WHERE (MikroORM $or,
// Drizzle, …), keeping the ORM-specific syntax the only thing a repo writes.
export interface KeysetComparison {
  readonly sortField: string
  readonly idField: string
  readonly operator: ComparisonOperator
  readonly sortValue: string | number
  readonly id: string
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
    operator: order === SortDirection.ASC ? '$gt' : '$lt',
    sortValue: cursor.sortValue,
    id: cursor.id,
  }
}
