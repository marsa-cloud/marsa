import { ApiProperty } from '@nestjs/swagger'
import type { User } from '#src/app/user/entities/user.table.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { UserRole, UserRoleApiProperty } from '#src/app/user/enums/user-role.enum.js'
import { ViewUserIndexQueryKey } from '#src/app/user/use-cases/view-user-index/query/view-user-index.query.js'
import {
  PaginatedKeysetResponse,
  PaginatedKeysetResponseMeta,
} from '#src/utils/pagination/keyset/paginated-keyset.response.js'

export class UserSummary {
  @ApiProperty({ type: String, format: 'uuid' })
  readonly uuid: UserUuid

  @ApiProperty({ type: String, example: '1' })
  readonly githubUserId: string

  @ApiProperty({ type: String, example: 'octocat' })
  readonly login: string

  @UserRoleApiProperty({ example: UserRole.Guest })
  readonly role: UserRole

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt: string

  constructor(user: User) {
    this.uuid = user.uuid
    this.githubUserId = user.githubUserId
    this.login = user.githubLogin
    this.role = user.role
    this.createdAt = user.createdAt.toISOString()
  }
}

export class ViewUserIndexResponseMeta extends PaginatedKeysetResponseMeta {
  @ApiProperty({ type: ViewUserIndexQueryKey, nullable: true })
  declare readonly next: ViewUserIndexQueryKey | null

  constructor(users: User[]) {
    super(ViewUserIndexQueryKey.nextKey(users))
  }
}

export class ViewUserIndexResponse extends PaginatedKeysetResponse<UserSummary> {
  @ApiProperty({ type: [UserSummary] })
  declare readonly items: UserSummary[]

  // Redeclared so OpenAPI names this use-case's meta instead of inheriting the
  // base's schema-less one — that is what gives the cursor a generated type on
  // the client rather than an opaque record.
  @ApiProperty({ type: ViewUserIndexResponseMeta })
  declare readonly meta: ViewUserIndexResponseMeta

  constructor(users: User[]) {
    super(
      users.map((user) => new UserSummary(user)),
      new ViewUserIndexResponseMeta(users),
    )
  }
}
