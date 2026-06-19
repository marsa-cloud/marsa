import { randomUUID } from 'node:crypto'

import { Entity, Enum, PrimaryKey, Property, Unique } from '@mikro-orm/core'

import { asUuid, type Uuid } from '#src/utils/uuid.js'

export enum UserRole {
  Operator = 'operator',
}

/**
 * A Marsa dashboard user, authenticated via GitHub user-OAuth (#62).
 *
 * `githubUserId` is GitHub's stable numeric user id, stored as a string — an
 * identifier, never used arithmetically.
 */
@Entity({ tableName: 'users' })
export class User {
  // Application-generated UUID (not a DB-side default): MikroORM assigns `uuid` on
  // instantiation via randomUUID(), so the row carries its key before flush — no
  // DB round-trip to learn it, and no autoincrement/serial sequence to coordinate.
  @PrimaryKey({ type: 'uuid' })
  uuid: Uuid = asUuid(randomUUID())

  @Property({ type: 'string', length: 255 })
  @Unique()
  githubUserId!: string

  @Property({ type: 'string', length: 255 })
  githubLogin!: string

  @Enum(() => UserRole)
  role: UserRole = UserRole.Operator

  @Property({ type: 'datetime' })
  createdAt: Date = new Date()

  @Property({ type: 'datetime', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
