import { Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import type { NodePin } from '#src/app/app-management/entities/node-pin.js'
import {
  type AppPlacement,
  selectAppPlacement,
} from '#src/app/app-management/queries/app-placement.js'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

export interface AppConfigPatch {
  image?: string
  containerPort?: number
  minReplicas?: number
  maxReplicas?: number
  env?: Record<string, string>
  nodePin?: NodePin | null
  imagePullCredentialsEnc?: string | null
}

@Injectable()
export class UpdateAppRepository {
  // Undefined fields are left untouched; undefined result means no app has the slug.
  async updateBySlug(tx: Executor, slug: string, patch: AppConfigPatch): Promise<App | undefined> {
    const { maxReplicas, ...rest } = patch
    const floor = sql`COALESCE(${patch.minReplicas ?? null}::integer, ${appTable.minReplicas})`
    // The command can only compare the fields it carries; the stored floor may be higher.
    const ceiling = sql`GREATEST(COALESCE(${maxReplicas ?? null}::integer, ${appTable.maxReplicas}), ${floor})`

    const [app] = await tx
      .update(appTable)
      .set({ ...rest, maxReplicas: ceiling })
      .where(eq(appTable.slug, slug))
      .returning()
    return app
  }

  async findPlacementBySlug(tx: Executor, slug: string): Promise<AppPlacement | undefined> {
    const [placement] = await selectAppPlacement(tx)
      .where(eq(appTable.slug, slug))
      .limit(1)
      .for('update', { of: appTable })
    return placement
  }

  // Scoped by app too: a release uuid read off the cluster can't address another app's release.
  async findRelease(
    tx: Executor,
    uuid: ReleaseUuid,
    appUuid: AppUuid,
  ): Promise<Release | undefined> {
    const [release] = await tx
      .select()
      .from(releaseTable)
      .where(and(eq(releaseTable.uuid, uuid), eq(releaseTable.appUuid, appUuid)))
      .limit(1)
    return release
  }
}
