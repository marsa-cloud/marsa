import { Entity, PrimaryKey, Property } from '@mikro-orm/core'
import type { ManifestStateUuid } from '#src/app/github-app/entities/manifest-state.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

/** Single-use CSRF token for the Manifest round-trip (#58, AgDR-0010); `uuid` is the `state`. */
@Entity({ tableName: 'github_app_manifest_state' })
export class ManifestState {
  @PrimaryKey({ type: 'uuid' })
  uuid: ManifestStateUuid = generateUuid<ManifestStateUuid>()

  @Property({ type: 'datetime' })
  expiresAt!: Date

  @Property({ type: 'datetime' })
  createdAt: Date = new Date()
}
