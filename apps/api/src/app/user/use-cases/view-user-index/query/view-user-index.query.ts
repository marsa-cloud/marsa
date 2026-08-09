import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNotEmpty, IsObject, IsOptional, IsUUID, ValidateNested } from 'class-validator'
import type { User } from '#src/app/user/entities/user.table.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import {
  PaginatedKeysetQuery,
  PaginatedKeysetSearchQuery,
} from '#src/utils/pagination/keyset/paginated-keyset.query.js'

/** Seek position for the user list — the uuidv7 primary key, ascending. */
export class ViewUserIndexQueryKey {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  uuid!: UserUuid

  static from(user: User): ViewUserIndexQueryKey {
    const key = new ViewUserIndexQueryKey()
    key.uuid = user.uuid
    return key
  }

  /** From the last user returned; `null` once a page comes back empty. */
  static nextKey(users: User[]): ViewUserIndexQueryKey | null {
    const last = users.at(-1)
    return last ? this.from(last) : null
  }
}

export class ViewUserIndexPaginationQuery extends PaginatedKeysetQuery {
  @ApiPropertyOptional({ type: ViewUserIndexQueryKey, nullable: true })
  @IsOptional()
  @Type(() => ViewUserIndexQueryKey)
  @ValidateNested()
  @IsObject()
  declare key?: ViewUserIndexQueryKey | null
}

export class ViewUserIndexQuery extends PaginatedKeysetSearchQuery {
  @ApiPropertyOptional({ type: ViewUserIndexPaginationQuery })
  @IsOptional()
  @Type(() => ViewUserIndexPaginationQuery)
  @ValidateNested()
  declare pagination?: ViewUserIndexPaginationQuery
}
