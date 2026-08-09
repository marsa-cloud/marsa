import { Injectable } from '@nestjs/common'
import { ViewUserIndexRepository } from '#src/app/user/use-cases/view-user-index/view-user-index.repository.js'
import { ViewUserIndexResponse } from '#src/app/user/use-cases/view-user-index/view-user-index.response.js'

@Injectable()
export class ViewUserIndexUseCase {
  constructor(private readonly repository: ViewUserIndexRepository) {}

  async execute(): Promise<ViewUserIndexResponse> {
    return new ViewUserIndexResponse(await this.repository.listUsers())
  }
}
