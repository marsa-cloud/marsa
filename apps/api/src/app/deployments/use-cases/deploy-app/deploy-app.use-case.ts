import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { AppBuilder } from '#src/app/deployments/entities/app.builder.js'
import { ReleaseBuilder } from '#src/app/deployments/entities/release.builder.js'
import { ReleaseStatus } from '#src/app/deployments/enums/release-status.enum.js'
import { ReleaseTrigger } from '#src/app/deployments/enums/release-trigger.enum.js'
import { renderManifests } from '#src/app/deployments/render/render-manifests.js'
import { DeployAppCommand } from '#src/app/deployments/use-cases/deploy-app/deploy-app.command.js'
import { DeployAppRepository } from '#src/app/deployments/use-cases/deploy-app/deploy-app.repository.js'
import { DeployAppResponse } from '#src/app/deployments/use-cases/deploy-app/deploy-app.response.js'
import { OPERATOR_APPS_NAMESPACE } from '#src/modules/kubernetes/deploy-backend.constants.js'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import type { RolloutPhase } from '#src/modules/kubernetes/deploy-backend.types.js'

/** Maps a cluster rollout phase to the persisted Release status (AgDR-0029). */
const PHASE_TO_STATUS: Record<RolloutPhase, ReleaseStatus> = {
  available: ReleaseStatus.Succeeded,
  progressing: ReleaseStatus.InProgress,
  failed: ReleaseStatus.Failed,
}

@Injectable()
export class DeployAppUseCase {
  constructor(
    private readonly repository: DeployAppRepository,
    private readonly deployBackend: DeployBackend,
    private readonly config: ConfigService,
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
      .withStatus(ReleaseStatus.Pending)
      .build()

    await this.repository.upsertAppAndCreateRelease(app, release)

    const manifests = renderManifests(app, release, baseDomain)
    await this.deployBackend.apply(OPERATOR_APPS_NAMESPACE, manifests)

    const phase = await this.deployBackend.rolloutStatus(OPERATOR_APPS_NAMESPACE, app.slug)
    const status = PHASE_TO_STATUS[phase]
    await this.repository.setReleaseStatus(release.uuid, status)
    release.status = status

    return new DeployAppResponse(app, release, baseDomain)
  }
}
