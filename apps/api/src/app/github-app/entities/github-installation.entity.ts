import { randomUUID } from 'node:crypto'

import { Entity, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/core'

import { GitHubApp } from '#src/app/github-app/entities/github-app.entity.js'

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
  id: string = randomUUID()

  @Property({ type: 'string', length: 255 })
  @Unique()
  installationId!: string

  @Property({ type: 'string', length: 255, nullable: true })
  accountLogin?: string

  @ManyToOne(() => GitHubApp, { nullable: false })
  app!: GitHubApp

  @Property({ type: 'datetime' })
  createdAt: Date = new Date()

  @Property({ type: 'datetime', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
