export abstract class KeysetQueryBuilder<
  TQuery extends { pagination?: TPagination },
  TPagination extends { limit?: number; key?: TKey | null },
  TKey,
> {
  protected constructor(
    protected readonly query: TQuery,
    protected readonly pagination: TPagination,
  ) {
    this.query.pagination = pagination
  }

  withLimit(limit: number): this {
    this.pagination.limit = limit
    return this
  }

  withKey(key: TKey | null): this {
    this.pagination.key = key
    return this
  }

  withoutPagination(): this {
    this.query.pagination = undefined
    return this
  }

  build(): TQuery {
    return this.query
  }
}
