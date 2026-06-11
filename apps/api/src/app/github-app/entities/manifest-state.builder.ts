import { ManifestState } from '#src/app/github-app/entities/manifest-state.entity.js'

export class ManifestStateBuilder {
  private readonly state = new ManifestState()

  withExpiresAt(expiresAt: Date): this {
    this.state.expiresAt = expiresAt
    return this
  }

  build(): ManifestState {
    return this.state
  }
}
