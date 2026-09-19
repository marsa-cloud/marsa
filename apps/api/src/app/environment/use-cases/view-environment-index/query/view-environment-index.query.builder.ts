import type { Environment } from '#src/app/environment/entities/environment.table.js'
import {
  ViewEnvironmentIndexPaginationQuery,
  ViewEnvironmentIndexQuery,
  ViewEnvironmentIndexQueryKey,
} from '#src/app/environment/use-cases/view-environment-index/query/view-environment-index.query.js'
import { KeysetQueryBuilder } from '#src/utils/pagination/keyset/keyset-query.builder.js'

export class ViewEnvironmentIndexQueryBuilder extends KeysetQueryBuilder<
  ViewEnvironmentIndexQuery,
  ViewEnvironmentIndexPaginationQuery,
  ViewEnvironmentIndexQueryKey
> {
  constructor() {
    super(new ViewEnvironmentIndexQuery(), new ViewEnvironmentIndexPaginationQuery())
  }

  withCursorAt(environment: Environment): this {
    return this.withKey(ViewEnvironmentIndexQueryKey.from(environment))
  }
}
