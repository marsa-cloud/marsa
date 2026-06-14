import { randomUUID } from 'node:crypto'

import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core'

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
  // Application-generated UUID (not a DB-side default): MikroORM assigns `uuid` on
  // instantiation via randomUUID(), so the row carries its key before flush — no
  // DB round-trip to learn it, and no autoincrement/serial sequence to coordinate.
  @PrimaryKey({ type: 'uuid' })
  uuid: string = randomUUID()

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
