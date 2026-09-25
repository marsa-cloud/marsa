import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import {
  type AppPlacement,
  selectAppPlacement,
} from '#src/app/app-management/queries/app-placement.js'
import {
  type DatabaseRow,
  databaseTable,
} from '#src/app/database-management/entities/database.table.js'
import type { DatabaseUuid } from '#src/app/database-management/entities/database.uuid.js'
import { databaseAttachmentTable } from '#src/app/database-management/entities/database-attachment.table.js'
import {
  type AttachedDatabase,
  selectAttachmentsForApp,
} from '#src/app/database-management/queries/app-attachments.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'
import { isUniqueViolation } from '#src/modules/database/postgres-errors.js'

export type InsertOutcome = 'inserted' | 'alias-taken' | 'already-attached'

@Injectable()
export class AttachDatabaseRepository {
  async lockApp(tx: Executor, slug: string): Promise<AppPlacement | undefined> {
    const [placement] = await selectAppPlacement(tx)
      .where(eq(appTable.slug, slug))
      .limit(1)
      .for('update', { of: appTable })
    return placement
  }

  // Scoped to the environment: a database elsewhere is not found, not forbidden.
  async findDatabaseInEnvironment(
    tx: Executor,
    environmentUuid: EnvironmentUuid,
    slug: string,
  ): Promise<DatabaseRow | undefined> {
    const [database] = await tx
      .select()
      .from(databaseTable)
      .where(and(eq(databaseTable.environmentUuid, environmentUuid), eq(databaseTable.slug, slug)))
      .limit(1)
    return database
  }

  async insert(
    tx: Executor,
    appUuid: AppUuid,
    databaseUuid: DatabaseUuid,
    alias: string | null,
  ): Promise<InsertOutcome> {
    try {
      await tx.insert(databaseAttachmentTable).values({ appUuid, databaseUuid, alias })
      return 'inserted'
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error
      }
      // Which constraint fired decides the message, so the operator learns what to change.
      return String(error).includes('app_uuid_database_uuid') ? 'already-attached' : 'alias-taken'
    }
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
