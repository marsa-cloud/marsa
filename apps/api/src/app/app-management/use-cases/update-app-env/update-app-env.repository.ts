import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class UpdateAppEnvRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findBySlug(slug: string): Promise<App | undefined> {
    const [app] = await this.db.select().from(appTable).where(eq(appTable.slug, slug)).limit(1)
    return app
  }

  /** Undefined when the row vanished between the lookup and this write (concurrent delete). */
  async updateEnv(uuid: AppUuid, env: Record<string, string>): Promise<App | undefined> {
    const [app] = await this.db
      .update(appTable)
      .set({ env })
      .where(eq(appTable.uuid, uuid))
      .returning()
    return app
  }
}
