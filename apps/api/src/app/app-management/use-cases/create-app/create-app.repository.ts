import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import { environmentTable } from '#src/app/environment/entities/environment.table.js'
import type { EnvironmentUuid } from '#src/app/environment/entities/environment.uuid.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class CreateAppRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async environmentExists(uuid: EnvironmentUuid): Promise<boolean> {
    const rows = await this.db
      .select({ uuid: environmentTable.uuid })
      .from(environmentTable)
      .where(eq(environmentTable.uuid, uuid))
      .limit(1)
    return rows.length > 0
  }

  async insert(app: App): Promise<boolean> {
    const rows = await this.db
      .insert(appTable)
      .values(app)
      .onConflictDoNothing({ target: appTable.slug })
      .returning({ uuid: appTable.uuid })
    return rows.length > 0
  }
}
