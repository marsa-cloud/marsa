import { Injectable, NotFoundException } from '@nestjs/common'
import { ViewDatabaseDependentIndexRepository } from '#src/app/database-management/use-cases/view-database-dependent-index/view-database-dependent-index.repository.js'
import { ViewDatabaseDependentIndexResponse } from '#src/app/database-management/use-cases/view-database-dependent-index/view-database-dependent-index.response.js'

@Injectable()
export class ViewDatabaseDependentIndexUseCase {
  constructor(private readonly repository: ViewDatabaseDependentIndexRepository) {}

  async execute(slug: string): Promise<ViewDatabaseDependentIndexResponse> {
    const database = await this.repository.findBySlug(slug)
    if (!database) {
      throw new NotFoundException(`Database '${slug}' was not found.`)
    }

    const dependents = await this.repository.listDependents(database.uuid)
    return new ViewDatabaseDependentIndexResponse(dependents)
  }
}
