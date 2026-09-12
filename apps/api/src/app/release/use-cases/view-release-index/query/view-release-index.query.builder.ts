import type { Release } from '#src/app/release/entities/release.table.js'
import {
  ViewReleaseIndexPaginationQuery,
  ViewReleaseIndexQuery,
  ViewReleaseIndexQueryKey,
} from '#src/app/release/use-cases/view-release-index/query/view-release-index.query.js'
import { KeysetQueryBuilder } from '#src/utils/pagination/keyset/keyset-query.builder.js'

export class ViewReleaseIndexQueryBuilder extends KeysetQueryBuilder<
  ViewReleaseIndexQuery,
  ViewReleaseIndexPaginationQuery,
  ViewReleaseIndexQueryKey
> {
  constructor() {
    super(new ViewReleaseIndexQuery(), new ViewReleaseIndexPaginationQuery())
  }

  withCursorAt(release: Release): this {
    return this.withKey(ViewReleaseIndexQueryKey.from(release))
  }
}
