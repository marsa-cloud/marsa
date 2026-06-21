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

  @UserRoleEnum({ default: UserRole.Operator })
  role!: UserRole

  @Property({ type: 'datetime' })
  createdAt: Date = new Date()

  @Property({ type: 'datetime', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
