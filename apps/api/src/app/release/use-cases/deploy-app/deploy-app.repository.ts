import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { type App, appTable } from '#src/app/app-management/entities/app.table.js'
import { type Release, releaseTable } from '#src/app/release/entities/release.table.js'
import type { ReleaseUuid } from '#src/app/release/entities/release.uuid.js'
import type { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class DeployAppRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async deploy(app: App, release: Release): Promise<void> {
    await this.db.transaction(async (tx) => {
      // On a slug conflict the stored uuid wins, so the release must bind to it
      // rather than to the freshly generated app.uuid.
      const [persisted] = await tx
        .insert(appTable)
        .values(app)
        .onConflictDoUpdate({
          target: appTable.slug,
          set: {
            domain: app.domain,
            image: app.image,
            containerPort: app.containerPort,
            replicas: app.replicas,
            env: app.env,
            imagePullCredentialsEnc: app.imagePullCredentialsEnc,
            updatedAt: app.updatedAt,
          },
        })
        .returning({ uuid: appTable.uuid })
      await tx.insert(releaseTable).values({ ...release, appUuid: persisted.uuid })
    })
  }

  async setReleaseDeployStatus(uuid: ReleaseUuid, deployStatus: DeployStatus): Promise<void> {
    await this.db.update(releaseTable).set({ deployStatus }).where(eq(releaseTable.uuid, uuid))
  }
}
