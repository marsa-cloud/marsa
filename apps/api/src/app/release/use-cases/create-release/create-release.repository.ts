import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import type { AppConfig } from '#src/app/release/entities/release-snapshot.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

@Injectable()
export class CreateReleaseRepository {
  async findAppBySlug(tx: Executor, slug: string): Promise<App | undefined> {
    const [app] = await tx
      .select()
      .from(appTable)
      .where(eq(appTable.slug, slug))
      .limit(1)
      .for('update')
    return app
  }

  async findRelease(tx: Executor, uuid: ReleaseUuid): Promise<Release | undefined> {
    const [release] = await tx
      .select()
      .from(releaseTable)
      .where(eq(releaseTable.uuid, uuid))
      .limit(1)
    return release
  }

  async insertRelease(tx: Executor, release: Release): Promise<void> {
    await tx.insert(releaseTable).values(release)
  }

  async restoreAppConfig(tx: Executor, appUuid: AppUuid, config: AppConfig): Promise<void> {
    await tx.update(appTable).set(config).where(eq(appTable.uuid, appUuid))
  }
}
