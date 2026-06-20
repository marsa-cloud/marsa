import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core'

import type { GitHubAppUuid } from '#src/app/github-app/entities/github-app.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

/**
 * A GitHub App provisioned for this install via the Manifest flow (#58,
 * AgDR-0005). One row per provisioned App.
 *
 * Secret columns (`*Enc`) hold AES-256-GCM ciphertext (AgDR-0006), never
 * plaintext. `githubAppId` is GitHub's numeric App id stored as a string —
 * it is an identifier, never used arithmetically.
 */
@Entity({ tableName: 'github_app' })
export class GitHubApp {
  @PrimaryKey({ type: 'uuid' })
  uuid: GitHubAppUuid = generateUuid<GitHubAppUuid>()

  @Property({ type: 'string', length: 255 })
  @Unique()
  githubAppId!: string

  @Property({ type: 'string', length: 255 })
  @Unique()
  slug!: string

  @Property({ type: 'string', length: 255 })
  name!: string

  @Property({ type: 'string', length: 255 })
  htmlUrl!: string

  @Property({ type: 'string', length: 255, nullable: true })
  ownerLogin?: string

  @Property({ type: 'string', length: 255 })
  clientId!: string

  @Property({ type: 'text' })
  clientSecretEnc!: string

  @Property({ type: 'text' })
  webhookSecretEnc!: string

  @Property({ type: 'text' })
  privateKeyPemEnc!: string

  @Property({ type: 'datetime' })
  createdAt: Date = new Date()

  @Property({ type: 'datetime', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
