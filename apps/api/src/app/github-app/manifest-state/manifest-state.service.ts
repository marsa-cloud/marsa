import { EntityManager } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'

import { ManifestState } from '#src/app/github-app/entities/manifest-state.entity.js'

const DEFAULT_TTL_MS = 10 * 60 * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * DB-backed, single-use CSRF state for the Manifest round-trip (AgDR-0010).
 * `issue` mints a row; `consume` atomically deletes it iff it exists and is
 * unexpired — so a token verifies at most once and cannot be replayed.
 */
@Injectable()
export class ManifestStateService {
  constructor(private readonly em: EntityManager) {}

  async issue(ttlMs: number = DEFAULT_TTL_MS): Promise<string> {
    const state = new ManifestState()
    state.expiresAt = new Date(Date.now() + ttlMs)
    await this.em.fork().persistAndFlush(state)
    return state.id
  }

  async consume(state: string): Promise<boolean> {
    if (!UUID_RE.test(state)) {
      return false
    }
    const deleted = await this.em
      .fork()
      .nativeDelete(ManifestState, { id: state, expiresAt: { $gt: new Date() } })
    return deleted === 1
  }
}
