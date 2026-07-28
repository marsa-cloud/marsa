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

  // First-deploy only: no slug conflict, so the in-memory `app.uuid` is the
  // persisted identity. Re-deploy (a slug conflict) keeps the DB's original
  // `uuid` (excluded from the update set) — at which point the caller must bind
  // the Release to the persisted App identity, not the freshly generated one,
  // to avoid an app_uuid FK mismatch. Deferred until re-deploy is implemented.
  async deploy(app: App, release: Release): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
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
      await tx.insert(releaseTable).values(release)
    })
  }

  async setReleaseDeployStatus(uuid: ReleaseUuid, deployStatus: DeployStatus): Promise<void> {
    await this.db.update(releaseTable).set({ deployStatus }).where(eq(releaseTable.uuid, uuid))
  }
}
