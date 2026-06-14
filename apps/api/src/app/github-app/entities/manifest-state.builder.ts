import { ManifestState } from '#src/app/github-app/entities/manifest-state.entity.js'

export class ManifestStateBuilder {
  private readonly state: ManifestState

  constructor() {
    this.state = new ManifestState()
    this.state.expiresAt = new Date(Date.now() + 10 * 60 * 1000)
  }

  withExpiresAt(expiresAt: Date): this {
    this.state.expiresAt = expiresAt
    return this
  }

  build(): ManifestState {
    return this.state
  }
}
