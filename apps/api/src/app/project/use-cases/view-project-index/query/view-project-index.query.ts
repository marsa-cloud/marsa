import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNotEmpty, IsObject, IsOptional, IsUUID, ValidateNested } from 'class-validator'
import type { Project } from '#src/app/project/entities/project.table.js'
import type { ProjectUuid } from '#src/app/project/entities/project.uuid.js'
import {
  PaginatedKeysetQuery,
  PaginatedKeysetSearchQuery,
} from '#src/utils/pagination/keyset/paginated-keyset.query.js'

export class ViewProjectIndexQueryKey {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  uuid!: ProjectUuid

  static from(project: Project): ViewProjectIndexQueryKey {
    const key = new ViewProjectIndexQueryKey()
    key.uuid = project.uuid
    return key
  }

  static nextKey(projects: Project[]): ViewProjectIndexQueryKey | null {
    const last = projects.at(-1)
    return last ? this.from(last) : null
  }
}

export class ViewProjectIndexPaginationQuery extends PaginatedKeysetQuery {
  @ApiPropertyOptional({ type: ViewProjectIndexQueryKey, nullable: true })
  @IsOptional()
  @Type(() => ViewProjectIndexQueryKey)
  @ValidateNested()
  @IsObject()
  declare key?: ViewProjectIndexQueryKey | null
}

export class ViewProjectIndexQuery extends PaginatedKeysetSearchQuery {
  @ApiPropertyOptional({ type: ViewProjectIndexPaginationQuery })
  @IsOptional()
  @Type(() => ViewProjectIndexPaginationQuery)
  @ValidateNested()
  declare pagination?: ViewProjectIndexPaginationQuery
}
