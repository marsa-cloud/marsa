import { EntityManager } from '@mikro-orm/core'
import { Injectable } from '@nestjs/common'
import { isUUID } from 'class-validator'
import dayjs from 'dayjs'
import { OAuthStateBuilder } from '#src/app/auth/entities/oauth-state.builder.js'
import { OAuthState } from '#src/app/auth/entities/oauth-state.entity.js'
import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'

const DEFAULT_TTL_MINUTES = 10

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

  async issue(ttlMinutes: number = DEFAULT_TTL_MINUTES): Promise<OAuthStateUuid> {
    const state = new OAuthStateBuilder()
      .withExpiresAt(dayjs().add(ttlMinutes, 'minute').toDate())
      .build()
    await this.em.fork().persistAndFlush(state)
    return state.uuid
  }

  async consume(state: OAuthStateUuid): Promise<boolean> {
    if (!isUUID(state)) {
      return false
    }
    // Atomic conditional delete → verifies at most once, no replay.
    const deleted = await this.em.fork().nativeDelete(OAuthState, {
      uuid: state,
      expiresAt: { $gt: dayjs().toDate() },
    })
    return deleted === 1
  }
}
