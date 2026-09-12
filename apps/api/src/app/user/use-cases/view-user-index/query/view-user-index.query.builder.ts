import type { User } from '#src/app/user/entities/user.table.js'
import {
  ViewUserIndexPaginationQuery,
  ViewUserIndexQuery,
  ViewUserIndexQueryKey,
} from '#src/app/user/use-cases/view-user-index/query/view-user-index.query.js'
import { KeysetQueryBuilder } from '#src/utils/pagination/keyset/keyset-query.builder.js'

export class ViewUserIndexQueryBuilder extends KeysetQueryBuilder<
  ViewUserIndexQuery,
  ViewUserIndexPaginationQuery,
  ViewUserIndexQueryKey
> {
  constructor() {
    super(new ViewUserIndexQuery(), new ViewUserIndexPaginationQuery())
  }

  withCursorAt(user: User): this {
    return this.withKey(ViewUserIndexQueryKey.from(user))
  }
}
