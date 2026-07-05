import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { AppBuilder } from '#src/app/deployments/entities/app.builder.js'
import { ReleaseBuilder } from '#src/app/deployments/entities/release.builder.js'
import { DeployStatus } from '#src/app/deployments/enums/deploy-status.enum.js'
import { ReleaseTrigger } from '#src/app/deployments/enums/release-trigger.enum.js'
import { renderManifests } from '#src/app/deployments/render/render-manifests.js'
import { DeployAppCommand } from '#src/app/deployments/use-cases/deploy-app/deploy-app.command.js'
import { DeployAppRepository } from '#src/app/deployments/use-cases/deploy-app/deploy-app.repository.js'
import { DeployAppResponse } from '#src/app/deployments/use-cases/deploy-app/deploy-app.response.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'

@Injectable()
export class DeployAppUseCase {
  constructor(
    private readonly repository: DeployAppRepository,
    private readonly deployBackend: DeployBackend,
    private readonly config: ConfigService,
    private readonly em: EntityManager,
  ) {}

  async execute(command: DeployAppCommand): Promise<DeployAppResponse> {
    const baseDomain = this.config.getOrThrow<string>('MARSA_BASE_DOMAIN')

    const app = new AppBuilder()
      .withSlug(command.slug)
      .withDomain({ type: 'subdomain' })
      .withImage(command.image)
      .withContainerPort(command.containerPort)
      .withReplicas(command.replicas ?? 1)
      .withEnv(command.env ?? {})
      .build()

    const release = new ReleaseBuilder()
      .withApp(app)
      .withImageRef(command.image)
      .withTriggeredBy(ReleaseTrigger.Manual)
      .withDeployStatus(DeployStatus.Pending)
      .build()

    await this.em.transactional(async () => {
      await this.repository.upsertApp(app)
      await this.repository.createRelease(release)
    })

    const manifests = renderManifests(app, release, baseDomain)

    try {
      await this.deployBackend.apply(OPERATOR_APPS_NAMESPACE, manifests)
    } catch (error) {
      await this.repository.setReleaseDeployStatus(release.uuid, DeployStatus.Failed)
      throw error
    }

    return new DeployAppResponse(app, release, baseDomain)
  }
}
