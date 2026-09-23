import { Injectable } from '@nestjs/common'
import { databaseRefOf } from '#src/app/database/queries/database-placement.js'
import { ViewDatabaseIndexQuery } from '#src/app/database/use-cases/view-database-index/query/view-database-index.query.js'
import { ViewDatabaseIndexRepository } from '#src/app/database/use-cases/view-database-index/view-database-index.repository.js'
import {
  DatabaseSummary,
  ViewDatabaseIndexResponse,
} from '#src/app/database/use-cases/view-database-index/view-database-index.response.js'
import { DatabaseRuntime } from '#src/modules/runtime/database-runtime.js'
import { keysetLimit } from '#src/utils/pagination/pagination-mapper.js'

@Injectable()
export class ViewDatabaseIndexUseCase {
  constructor(
    private readonly repository: ViewDatabaseIndexRepository,
    private readonly runtime: DatabaseRuntime,
  ) {}

  async execute(query: ViewDatabaseIndexQuery): Promise<ViewDatabaseIndexResponse> {
    const placements = await this.repository.listDatabases(
      keysetLimit(query.pagination),
      query.pagination?.key?.uuid,
    )
    // Status is never stored, so it is read per row rather than reconciled on a GET (#198).
    const statuses = await Promise.all(
      placements.map((placement) => this.runtime.readStatus(databaseRefOf(placement))),
    )
    const summaries = placements.map(
      (placement, index) => new DatabaseSummary(placement, statuses[index]!),
    )
    return new ViewDatabaseIndexResponse(summaries, placements)
  }
}
