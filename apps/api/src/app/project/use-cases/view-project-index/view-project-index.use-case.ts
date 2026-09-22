import { Injectable } from '@nestjs/common'
import { ViewProjectIndexRepository } from '#src/app/project/use-cases/view-project-index/view-project-index.repository.js'
import { ViewProjectIndexResponse } from '#src/app/project/use-cases/view-project-index/view-project-index.response.js'

@Injectable()
export class ViewProjectIndexUseCase {
  constructor(private readonly repository: ViewProjectIndexRepository) {}

  async execute(): Promise<ViewProjectIndexResponse> {
    return new ViewProjectIndexResponse(await this.repository.listProjects())
  }
}
