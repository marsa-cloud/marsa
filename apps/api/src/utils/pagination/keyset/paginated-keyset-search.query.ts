import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ValidateNested } from 'class-validator'
import { PaginatedKeysetQuery } from '#src/utils/pagination/keyset/paginated-keyset.query.js'
import { SearchQuery } from '#src/utils/pagination/search/search.query.js'

// Keyset pagination + the composable search surface. A use-case extends this and
// redeclares whichever of sort / filter / search it needs.
export abstract class PaginatedKeysetSearchQuery extends SearchQuery {
  @ApiPropertyOptional({ type: PaginatedKeysetQuery })
  @ValidateNested()
  @Type(() => PaginatedKeysetQuery)
  pagination: PaginatedKeysetQuery = new PaginatedKeysetQuery()
}
