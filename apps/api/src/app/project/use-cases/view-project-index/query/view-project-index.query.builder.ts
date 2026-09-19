import type { Project } from '#src/app/project/entities/project.table.js'
import {
  ViewProjectIndexPaginationQuery,
  ViewProjectIndexQuery,
  ViewProjectIndexQueryKey,
} from '#src/app/project/use-cases/view-project-index/query/view-project-index.query.js'
import { KeysetQueryBuilder } from '#src/utils/pagination/keyset/keyset-query.builder.js'

export class ViewProjectIndexQueryBuilder extends KeysetQueryBuilder<
  ViewProjectIndexQuery,
  ViewProjectIndexPaginationQuery,
  ViewProjectIndexQueryKey
> {
  constructor() {
    super(new ViewProjectIndexQuery(), new ViewProjectIndexPaginationQuery())
  }

  withCursorAt(project: Project): this {
    return this.withKey(ViewProjectIndexQueryKey.from(project))
  }
}
