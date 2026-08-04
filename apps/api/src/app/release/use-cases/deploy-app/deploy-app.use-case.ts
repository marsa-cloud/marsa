import { Injectable } from '@nestjs/common'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { DeployStatus } from '#src/app/release/enums/deploy-status.enum.js'
import { ReleaseTrigger } from '#src/app/release/enums/release-trigger.enum.js'
import { ApplyReleaseService } from '#src/app/release/services/apply-release/apply-release.service.js'
import { DeployAppCommand } from '#src/app/release/use-cases/deploy-app/deploy-app.command.js'
import { DeployAppRepository } from '#src/app/release/use-cases/deploy-app/deploy-app.repository.js'
import { DeployAppResponse } from '#src/app/release/use-cases/deploy-app/deploy-app.response.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class DeployAppUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: DeployAppRepository,
    private readonly applyRelease: ApplyReleaseService,
    private readonly cipher: SecretCipherService,
  ) {}

  async execute(command: DeployAppCommand): Promise<DeployAppResponse> {
    const credentials = command.imagePullCredentials
    const app = new AppBuilder()
      .withSlug(command.slug)
      .withDomain({ type: 'subdomain' })
      .withImage(command.image)
      .withContainerPort(command.containerPort)
      .withReplicas(command.replicas ?? 1)
      .withEnv(command.env ?? {})
      .withImagePullCredentialsEnc(
        credentials ? this.cipher.encrypt(JSON.stringify(credentials)) : null,
      )
      .build()

    const release = new ReleaseBuilder()
      .withApp(app)
      .withImageRef(command.image)
      .withTriggeredBy(ReleaseTrigger.Manual)
      .withDeployStatus(DeployStatus.Pending)
      .build()

    await this.db.transaction(async (tx) => {
      const appUuid = await this.repository.upsertApp(tx, app)
      await this.repository.createRelease(tx, { ...release, appUuid })
    })

    try {
      await this.applyRelease.apply(app, release, credentials)
    } catch (error) {
      await this.repository.setReleaseDeployStatus(release.uuid, DeployStatus.Failed)
      throw error
    }

    return new DeployAppResponse(app, release, this.applyRelease.baseDomain)
  }
}
