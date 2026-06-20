import { Entity, PrimaryKey, Property } from '@mikro-orm/core'

import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

/** Single-use CSRF token for the user-OAuth round-trip (#62); `uuid` is the `state`. */
@Entity({ tableName: 'auth_oauth_state' })
export class OAuthState {
  @PrimaryKey({ type: 'uuid' })
  uuid: OAuthStateUuid = generateUuid<OAuthStateUuid>()

  @Property({ type: 'datetime' })
  expiresAt!: Date

  @Property({ type: 'datetime' })
  createdAt: Date = new Date()
}
