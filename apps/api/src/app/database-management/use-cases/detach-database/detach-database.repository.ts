import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import {
  type AppPlacement,
  selectAppPlacement,
} from '#src/app/app-management/queries/app-placement.js'
import { databaseTable } from '#src/app/database-management/entities/database.table.js'
import type { DatabaseUuid } from '#src/app/database-management/entities/database.uuid.js'
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

  async findDatabaseUuid(tx: Executor, slug: string): Promise<DatabaseUuid | undefined> {
    const [database] = await tx
      .select({ uuid: databaseTable.uuid })
      .from(databaseTable)
      .where(eq(databaseTable.slug, slug))
      .limit(1)
    return database?.uuid
  }

  async deleteAttachment(
    tx: Executor,
    appUuid: AppUuid,
    databaseUuid: DatabaseUuid,
  ): Promise<boolean> {
    const deleted = await tx
      .delete(databaseAttachmentTable)
      .where(
        and(
          eq(databaseAttachmentTable.appUuid, appUuid),
          eq(databaseAttachmentTable.databaseUuid, databaseUuid),
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
