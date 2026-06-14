import { EntityManager } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'

import { ManifestStateBuilder } from '#src/app/github-app/entities/manifest-state.builder.js'
import { ManifestState } from '#src/app/github-app/entities/manifest-state.entity.js'

const DEFAULT_TTL_MS = 10 * 60 * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * DB-backed, single-use CSRF state for the Manifest round-trip (AgDR-0010).
 */
@Injectable()
export class ManifestStateService {
  constructor(private readonly em: EntityManager) {}

  async issue(ttlMs: number = DEFAULT_TTL_MS): Promise<string> {
    const state = new ManifestStateBuilder().withExpiresAt(new Date(Date.now() + ttlMs)).build()
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
      .nativeDelete(ManifestState, { uuid: state, expiresAt: { $gt: new Date() } })
    return deleted === 1
  }
}
