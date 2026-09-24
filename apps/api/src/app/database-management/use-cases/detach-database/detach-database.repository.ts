import { Injectable } from '@nestjs/common'
import { and, eq, inArray } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import {
  type AppPlacement,
  selectAppPlacement,
} from '#src/app/app-management/queries/app-placement.js'
import { databaseTable } from '#src/app/database-management/entities/database.table.js'
import { databaseAttachmentTable } from '#src/app/database-management/entities/database-attachment.table.js'
import {
  type AttachedDatabase,
  selectAttachmentsForApp,
} from '#src/app/database-management/queries/app-attachments.js'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

@Injectable()
export class DetachDatabaseRepository {
  async lockApp(tx: Executor, slug: string): Promise<AppPlacement | undefined> {
    const [placement] = await selectAppPlacement(tx)
      .where(eq(appTable.slug, slug))
      .limit(1)
      .for('update', { of: appTable })
    return placement
  }

  // Keyed by database slug: the unprefixed attachment's alias is null and cannot address itself.
  async deleteAttachment(tx: Executor, appUuid: AppUuid, databaseSlug: string): Promise<boolean> {
    const deleted = await tx
      .delete(databaseAttachmentTable)
      .where(
        and(
          eq(databaseAttachmentTable.appUuid, appUuid),
          inArray(
            databaseAttachmentTable.databaseUuid,
            tx
              .select({ uuid: databaseTable.uuid })
              .from(databaseTable)
              .where(eq(databaseTable.slug, databaseSlug)),
          ),
        ),
      )
      .returning({ uuid: databaseAttachmentTable.uuid })
    return deleted.length > 0
  }

  findAttachments(tx: Executor, appUuid: AppUuid): Promise<AttachedDatabase[]> {
    return selectAttachmentsForApp(tx, appUuid)
  }

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
