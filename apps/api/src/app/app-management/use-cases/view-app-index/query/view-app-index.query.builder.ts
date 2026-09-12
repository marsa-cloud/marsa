import type { App } from '#src/app/app-management/entities/app.table.js'
import {
  ViewAppIndexPaginationQuery,
  ViewAppIndexQuery,
  ViewAppIndexQueryKey,
} from '#src/app/app-management/use-cases/view-app-index/query/view-app-index.query.js'
import { KeysetQueryBuilder } from '#src/utils/pagination/keyset/keyset-query.builder.js'

export class ViewAppIndexQueryBuilder extends KeysetQueryBuilder<
  ViewAppIndexQuery,
  ViewAppIndexPaginationQuery,
  ViewAppIndexQueryKey
> {
  constructor() {
    super(new ViewAppIndexQuery(), new ViewAppIndexPaginationQuery())
  }

  withCursorAt(app: App): this {
    return this.withKey(ViewAppIndexQueryKey.from(app))
  }
}
