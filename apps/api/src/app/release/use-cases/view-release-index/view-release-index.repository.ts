import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import type { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewReleaseIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findByAppSlug(slug: string): Promise<Release[]> {
    return this.db.query.releaseTable.findMany({
      where: { app: { slug } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async setReleaseDeployStatus(uuid: ReleaseUuid, deployStatus: DeployStatus): Promise<void> {
    await this.db.update(releaseTable).set({ deployStatus }).where(eq(releaseTable.uuid, uuid))
  }
}
