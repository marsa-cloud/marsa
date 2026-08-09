import { Injectable } from '@nestjs/common'
import { ViewUserIndexQuery } from '#src/app/user/use-cases/view-user-index/query/view-user-index.query.js'
import { ViewUserIndexRepository } from '#src/app/user/use-cases/view-user-index/view-user-index.repository.js'
import { ViewUserIndexResponse } from '#src/app/user/use-cases/view-user-index/view-user-index.response.js'
import { keysetLimit } from '#src/utils/pagination/pagination-mapper.js'

@Injectable()
export class ViewUserIndexUseCase {
  constructor(private readonly repository: ViewUserIndexRepository) {}

  async execute(query: ViewUserIndexQuery): Promise<ViewUserIndexResponse> {
    const users = await this.repository.listUsers(
      keysetLimit(query.pagination),
      query.pagination?.key?.uuid,
    )
    return new ViewUserIndexResponse(users)
  }
}
