import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import {
  type AttachedDatabase,
  selectAttachmentsForApp,
} from '#src/app/database-management/queries/app-attachments.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewAppAttachmentIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findAppBySlug(slug: string): Promise<App | undefined> {
    const [app] = await this.db.select().from(appTable).where(eq(appTable.slug, slug)).limit(1)
    return app
  }

  listAttachments(appUuid: AppUuid): Promise<AttachedDatabase[]> {
    return selectAttachmentsForApp(this.db, appUuid)
  }
}
