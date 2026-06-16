import { OAuthState } from '#src/app/auth/entities/oauth-state.entity.js'

export class OAuthStateBuilder {
  private readonly state: OAuthState

  constructor() {
    this.state = new OAuthState()
    this.state.expiresAt = new Date(Date.now() + 10 * 60 * 1000)
  }

  withExpiresAt(expiresAt: Date): this {
    this.state.expiresAt = expiresAt
    return this
  }

  build(): OAuthState {
    return this.state
  }
}
