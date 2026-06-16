import { randomUUID } from 'node:crypto'

import { Entity, PrimaryKey, Property } from '@mikro-orm/core'

/** Single-use CSRF token for the user-OAuth round-trip (#62); `uuid` is the `state`. */
@Entity({ tableName: 'auth_oauth_state' })
export class OAuthState {
  @PrimaryKey({ type: 'uuid' })
  uuid: string = randomUUID()

  @Property({ type: 'datetime' })
  expiresAt!: Date

  @Property({ type: 'datetime' })
  createdAt: Date = new Date()
}
