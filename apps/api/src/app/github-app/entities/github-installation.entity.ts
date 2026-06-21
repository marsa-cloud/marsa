import { Entity, ManyToOne, PrimaryKey, Property, type Ref, Unique } from '@mikro-orm/core'

import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

/**
 * A GitHub App installation captured after the operator installs the App on
 * their repos (#59, AgDR-0005). One row per installation — a single self-hosted
 * App can be installed on the operator's personal account plus N orgs, so this
 * is a many-to-one against `github_app`, not a column on it (AgDR-0013).
 *
 * `installationId` is GitHub's numeric installation id stored as a string — it
 * is an identifier, never used arithmetically. `accountLogin` is nullable; it is
 * enriched from webhook payloads later (#61).
 */
@Entity({ tableName: 'github_installation' })
export class GitHubInstallation {
  @PrimaryKey({ type: 'uuid' })
  uuid: GitHubInstallationUuid = generateUuid<GitHubInstallationUuid>()

  @Property({ type: 'string', length: 255 })
  @Unique()
  installationId!: string

  @Property({ type: 'string', length: 255, nullable: true })
  accountLogin?: string | null

  // Explicit owning FK relation: a typed `Ref` makes the foreign key first-class
  // (column `app_uuid` → `github_app.uuid`) and lets callers read `app.uuid`
  // without loading the row. We model the FK via the reference, not a duplicate
  // scalar column (which MikroORM would double-map).
  @ManyToOne(() => GitHubApp, { nullable: false, ref: true })
  app!: Ref<GitHubApp>

  @Property({ type: 'datetime' })
  createdAt: Date = new Date()

  @Property({ type: 'datetime', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
