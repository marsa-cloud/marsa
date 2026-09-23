import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

@Injectable()
export class StartBuildRepository {
  async findAppBySlug(tx: Executor, slug: string): Promise<App | undefined> {
    const [app] = await tx
      .select()
      .from(appTable)
      .where(eq(appTable.slug, slug))
      .limit(1)
      .for('update')
    return app
  }
}
