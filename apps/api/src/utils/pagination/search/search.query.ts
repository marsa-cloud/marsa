import { type BaseFilterQuery } from '#src/utils/pagination/search/base-filter.query.js'
import { type SortQuery } from '#src/utils/pagination/search/sort.query.js'

// Composable search surface. Members are optional so a use-case opts into only
// what it needs; it redeclares each used field with a concrete type +
// @ValidateNested()/@Type().
export abstract class SearchQuery {
  sort?: SortQuery
  filter?: BaseFilterQuery
  search?: string
}
