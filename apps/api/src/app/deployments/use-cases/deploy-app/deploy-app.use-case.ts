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

    // Desired state is already persisted; the cluster apply is the side effect
    // that can still fail. On failure, mark the Release Failed and rethrow —
    // there is no cross-cluster transaction to roll apply() back. Deriving the
    // eventual terminal status of a *successful* rollout (Deploying → Deployed)
    // is deferred to the status-reconciliation follow-up; the Release stays
    // Pending here on purpose. See marsa-cloud/marsa#77 sub-issue.
    try {
      await this.deployBackend.apply(OPERATOR_APPS_NAMESPACE, manifests)
    } catch (error) {
      release.status = ReleaseStatus.Failed
      try {
        await this.repository.setReleaseStatus(release.uuid, ReleaseStatus.Failed)
      } catch (persistError) {
        // Don't let a status-write failure mask the real (apply) failure —
        // surface it as the cause and note the persistence miss.
        const detail = persistError instanceof Error ? persistError.message : String(persistError)
        throw new Error(`cluster apply failed; also failed to persist Failed status: ${detail}`, {
          cause: error,
        })
      }
      throw error
    }

    return new DeployAppResponse(app, release, baseDomain)
  }
}
