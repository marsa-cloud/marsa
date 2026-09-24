import { Injectable, NotFoundException } from '@nestjs/common'
import { catalogueEntry } from '#src/app/database/entities/engine-catalogue.js'
import { ViewDatabaseDetailRepository } from '#src/app/database/use-cases/view-database-detail/view-database-detail.repository.js'
import { ViewDatabaseDetailResponse } from '#src/app/database/use-cases/view-database-detail/view-database-detail.response.js'
import { DatabaseCredentialsCipher } from '#src/modules/crypto/database-credentials.cipher.js'
import { DatabaseRuntime } from '#src/modules/runtime/database-runtime.js'

@Injectable()
export class ViewDatabaseDetailUseCase {
  constructor(
    private readonly repository: ViewDatabaseDetailRepository,
    private readonly cipher: DatabaseCredentialsCipher,
    private readonly runtime: DatabaseRuntime,
  ) {}

  async execute(slug: string): Promise<ViewDatabaseDetailResponse> {
    const placement = await this.repository.findPlacementBySlug(slug)
    if (!placement) {
      throw new NotFoundException(`Database '${slug}' was not found.`)
    }

    const { database } = placement
    const entry = catalogueEntry(database.engine, database.version)
    if (!entry) {
      throw new NotFoundException(
        `${database.engine} ${database.version} is no longer an available version.`,
      )
    }

    const credentials = this.cipher.openForDatabase(slug, database.credentialsEnc)
    const status = await this.runtime.readStatus(placement)
    return new ViewDatabaseDetailResponse(placement, status, entry.port, credentials)
  }
}
