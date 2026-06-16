import { randomUUID } from 'node:crypto'

import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core'

/**
 * A Marsa dashboard operator, authenticated via GitHub user-OAuth (#62).
 *
 * `githubUserId` is GitHub's stable numeric user id, stored as a string — an
 * identifier, never used arithmetically. Per AgDR-0004, this column is the
 * forward-compat key: when v0.2 migrates to Zitadel, operators map across by
 * this id with zero re-onboarding.
 */
@Entity({ tableName: 'operator' })
export class Operator {
  // Application-generated UUID (not a DB-side default): MikroORM assigns `uuid` on
  // instantiation via randomUUID(), so the row carries its key before flush — no
  // DB round-trip to learn it, and no autoincrement/serial sequence to coordinate.
  @PrimaryKey({ type: 'uuid' })
  uuid: string = randomUUID()

  @Property({ type: 'string', length: 255 })
  @Unique()
  githubUserId!: string

  @Property({ type: 'string', length: 255 })
  githubLogin!: string

  @Property({ type: 'datetime' })
  createdAt: Date = new Date()

  @Property({ type: 'datetime', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
