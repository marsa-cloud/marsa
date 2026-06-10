import { randomUUID } from 'node:crypto'

import { Entity, PrimaryKey, Property } from '@mikro-orm/core'

/**
 * A single-use CSRF token for the GitHub App Manifest round-trip (#58, AgDR-0010).
 * The `id` UUID is the opaque `state` handed to GitHub and echoed back on the
 * callback; the row is deleted the moment it is consumed, so a token is valid at
 * most once and only until `expiresAt`. Replaces the prior stateless HMAC signer.
 */
@Entity({ tableName: 'github_app_manifest_state' })
export class ManifestState {
  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID()

  @Property({ type: 'datetime' })
  expiresAt!: Date

  @Property({ type: 'datetime' })
  createdAt: Date = new Date()
}
