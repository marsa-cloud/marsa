import { EntityManager } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'

import { OAuthStateBuilder } from '#src/app/auth/entities/oauth-state.builder.js'
import { OAuthState } from '#src/app/auth/entities/oauth-state.entity.js'

const DEFAULT_TTL_MS = 10 * 60 * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * DB-backed, single-use CSRF state for the user-OAuth round-trip (#62).
 *
 * Mirrors `ManifestStateService` (AgDR-0010) rather than reusing it directly —
 * the two states protect different flows and the table/feature is kept
 * feature-internal per the "feature-internal code stays inside the feature
 * folder" convention.
 */
@Injectable()
export class OAuthStateService {
  constructor(private readonly em: EntityManager) {}

  async issue(ttlMs: number = DEFAULT_TTL_MS): Promise<string> {
    const state = new OAuthStateBuilder().withExpiresAt(new Date(Date.now() + ttlMs)).build()
    await this.em.fork().persistAndFlush(state)
    return state.uuid
  }

  async consume(state: string): Promise<boolean> {
    if (!UUID_RE.test(state)) {
      return false
    }
    // Atomic conditional delete → verifies at most once, no replay.
    const deleted = await this.em
      .fork()
      .nativeDelete(OAuthState, { uuid: state, expiresAt: { $gt: new Date() } })
    return deleted === 1
  }
}
