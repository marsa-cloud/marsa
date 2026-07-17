import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ValidateNested } from 'class-validator'
import { PaginatedOffsetQuery } from '#src/utils/pagination/offset/paginated-offset.query.js'
import { SearchQuery } from '#src/utils/pagination/search/search.query.js'

// Offset pagination + the composable search surface. A use-case extends this and
// redeclares whichever of sort / filter / search it needs.
export abstract class PaginatedOffsetSearchQuery extends SearchQuery {
  @ApiPropertyOptional({ type: PaginatedOffsetQuery })
  @ValidateNested()
  @Type(() => PaginatedOffsetQuery)
  pagination: PaginatedOffsetQuery = new PaginatedOffsetQuery()
}
