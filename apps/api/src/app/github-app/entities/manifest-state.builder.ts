import type { ManifestState } from '#src/app/github-app/entities/manifest-state.table.js'
import type { ManifestStateUuid } from '#src/app/github-app/entities/manifest-state.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

export class ManifestStateBuilder {
  private readonly state: ManifestState

  constructor() {
    this.state = {
      uuid: generateUuid<ManifestStateUuid>(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      createdAt: new Date(),
    }
  }

  withExpiresAt(expiresAt: Date): this {
    this.state.expiresAt = expiresAt
    return this
  }

  build(): ManifestState {
    return this.state
  }
}
