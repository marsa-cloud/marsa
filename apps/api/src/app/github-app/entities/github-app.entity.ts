import { randomUUID } from 'node:crypto'

import { Entity, PrimaryKey, Property } from '@mikro-orm/core'

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
  id: string = randomUUID()

  @Property()
  githubAppId!: string

  @Property()
  slug!: string

  @Property()
  name!: string

  @Property()
  htmlUrl!: string

  @Property({ nullable: true })
  ownerLogin?: string

  @Property()
  clientId!: string

  @Property({ type: 'text' })
  clientSecretEnc!: string

  @Property({ type: 'text' })
  webhookSecretEnc!: string

  @Property({ type: 'text' })
  privateKeyPemEnc!: string

  @Property()
  createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
