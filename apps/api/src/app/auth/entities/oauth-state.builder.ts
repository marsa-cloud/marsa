import dayjs from 'dayjs'
import { OAuthState } from '#src/app/auth/entities/oauth-state.entity.js'

export class OAuthStateBuilder {
  private readonly state: OAuthState

  constructor() {
    this.state = new OAuthState()
    this.state.expiresAt = dayjs().add(10, 'minute').toDate()
  }

  withExpiresAt(expiresAt: Date): this {
    this.state.expiresAt = expiresAt
    return this
  }

  build(): OAuthState {
    return this.state
  }
}
