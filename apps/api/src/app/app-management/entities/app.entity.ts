import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import type { AppDomain } from '#src/app/app-management/entities/app-domain.types.js'
import { generateUuid } from '#src/utils/uuid.js'

@Entity({ tableName: 'app' })
export class App {
  @PrimaryKey({ type: 'uuid' })
  uuid: AppUuid = generateUuid<AppUuid>()

  @Property({ type: 'string', length: 255 })
  @Unique()
  slug!: string

  @Property({ type: 'jsonb' })
  domain!: AppDomain

  @Property({ type: 'string', length: 255 })
  image!: string

  @Property({ type: 'integer' })
  containerPort!: number

  @Property({ type: 'integer', default: 1 })
  replicas: number = 1

  @Property({ type: 'jsonb' })
  env: Record<string, string> = {}

  @Property({ type: 'text', nullable: true })
  imagePullCredentialsEnc?: string | null

  @Property({ type: 'datetime' })
  createdAt: Date = new Date()

  @Property({ type: 'datetime', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
