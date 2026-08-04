import { Injectable } from '@nestjs/common'
import { and, eq, gt } from 'drizzle-orm'
import { ManifestStateBuilder } from '#src/app/github-app/entities/manifest-state.builder.js'
import { manifestStateTable } from '#src/app/github-app/entities/manifest-state.table.js'
import type { ManifestStateUuid } from '#src/app/github-app/entities/manifest-state.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

const DEFAULT_TTL_MS = 10 * 60 * 1000

/**
 * DB-backed, single-use CSRF state for the Manifest round-trip (AgDR-0010).
 */
@Injectable()
export class ManifestStateService {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async issue(ttlMs: number = DEFAULT_TTL_MS): Promise<ManifestStateUuid> {
    const state = new ManifestStateBuilder().withExpiresAt(new Date(Date.now() + ttlMs)).build()
    await this.db.insert(manifestStateTable).values(state)
    return state.uuid
  }

  async consume(state: ManifestStateUuid): Promise<boolean> {
    // Atomic conditional delete → verifies at most once, no replay.
    const deleted = await this.db
      .delete(manifestStateTable)
      .where(and(eq(manifestStateTable.uuid, state), gt(manifestStateTable.expiresAt, new Date())))
      .returning()
    return deleted.length === 1
  }
}
