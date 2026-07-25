import dayjs from 'dayjs'
import type { OAuthState } from '#src/app/auth/entities/oauth-state.table.js'
import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

export class OAuthStateBuilder {
  private readonly state: OAuthState

  constructor() {
    this.state = {
      uuid: generateUuid<OAuthStateUuid>(),
      expiresAt: dayjs().add(10, 'minute').toDate(),
      createdAt: new Date(),
    }
  }

  withExpiresAt(expiresAt: Date): this {
    this.state.expiresAt = expiresAt
    return this
  }

  build(): OAuthState {
    return this.state
  }
}
