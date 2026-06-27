import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core'

import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { UserRole, UserRoleEnum } from '#src/app/user/enums/user-role.enum.js'
import { generateUuid } from '#src/utils/uuid.js'

@Entity({ tableName: 'user' })
export class User {
  @PrimaryKey({ type: 'uuid' })
  uuid: UserUuid = generateUuid<UserUuid>()

  @Property({ type: 'string', length: 255 })
  @Unique()
  githubUserId!: string

  @Property({ type: 'string', length: 255 })
  githubLogin!: string

  // Safe-by-default: new users are Members; Operator is assigned explicitly to
  // the first user at login (never defaulted to, to avoid privilege escalation).
  @UserRoleEnum({ default: UserRole.Member })
  role!: UserRole

  @Property({ type: 'datetime' })
  createdAt: Date = new Date()

  @Property({ type: 'datetime', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
