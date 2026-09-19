import { Injectable } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

export interface AppConfigPatch {
  image?: string
  containerPort?: number
  minReplicas?: number
  maxReplicas?: number
  env?: Record<string, string>
  imagePullCredentialsEnc?: string | null
}

@Injectable()
export class UpdateAppRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  // Undefined fields are left untouched; undefined result means no app has the slug.
  async updateBySlug(slug: string, patch: AppConfigPatch): Promise<App | undefined> {
    const { maxReplicas, ...rest } = patch
    const floor = sql`COALESCE(${patch.minReplicas ?? null}::integer, ${appTable.minReplicas})`
    // The command can only compare the fields it carries; the stored floor may be higher.
    const ceiling = sql`GREATEST(COALESCE(${maxReplicas ?? null}::integer, ${appTable.maxReplicas}), ${floor})`

    const [app] = await this.db
      .update(appTable)
      .set({ ...rest, maxReplicas: ceiling })
      .where(eq(appTable.slug, slug))
      .returning()
    return app
  }
}
