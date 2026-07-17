import { type SortDirection } from '#src/utils/pagination/search/sort-direction.js'

// Base for a use-case's sort DTO. The use-case narrows `key` to a union/enum of
// its sortable columns and decorates both fields (@ApiProperty + validators).
export abstract class SortQuery {
  abstract key: string
  abstract order: SortDirection
}
