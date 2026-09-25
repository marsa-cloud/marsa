import type { DatabaseRow } from '#src/app/database-management/entities/database.table.js'
import {
  ViewDatabaseIndexPaginationQuery,
  ViewDatabaseIndexQuery,
  ViewDatabaseIndexQueryKey,
} from '#src/app/database-management/use-cases/view-database-index/query/view-database-index.query.js'
import { KeysetQueryBuilder } from '#src/utils/pagination/keyset/keyset-query.builder.js'

export class ViewDatabaseIndexQueryBuilder extends KeysetQueryBuilder<
  ViewDatabaseIndexQuery,
  ViewDatabaseIndexPaginationQuery,
  ViewDatabaseIndexQueryKey
> {
  constructor() {
    super(new ViewDatabaseIndexQuery(), new ViewDatabaseIndexPaginationQuery())
  }

  withCursorAt(database: DatabaseRow): this {
    return this.withKey(ViewDatabaseIndexQueryKey.from(database))
  }
}
