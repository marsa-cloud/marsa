import { Injectable } from '@nestjs/common'

import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import type {
  AppHealth,
  DeployEvent,
  RenderedManifests,
} from '#src/modules/kubernetes/deploy-backend.types.js'
import { RolloutStatus } from '#src/modules/kubernetes/rollout-status.js'

/**
 * Network-free `DeployBackend` for test/local environments (mirrors the
 * `MockGithubClient` seam, AgDR-0014). Applies nothing and reports a healthy,
 * complete rollout so e2e tests exercise the full deploy + status use-cases with
 * no cluster. Override individual methods via
 * `sinon.createStubInstance(MockDeployBackend)`.
 */
@Injectable()
export class MockDeployBackend extends DeployBackend {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  apply(_namespace: string, _manifests: RenderedManifests): Promise<void> {
    return Promise.resolve()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  readRolloutStatus(_namespace: string, _deploymentName: string): Promise<RolloutStatus> {
    return Promise.resolve(RolloutStatus.Complete)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  readAppHealth(_namespace: string, _deploymentName: string): Promise<AppHealth> {
    return Promise.resolve({
      found: true,
      desiredReplicas: 1,
      availableReplicas: 1,
      updatedReplicas: 1,
    })
  }

  readDeployEvents(_namespace: string, deploymentName: string): Promise<DeployEvent[]> {
    return Promise.resolve([
      {
        type: 'Normal',
        reason: 'ScalingReplicaSet',
        message: `Scaled up replica set ${deploymentName}-mock to 1`,
        count: 1,
        lastSeen: new Date().toISOString(),
        involvedObject: { kind: 'Deployment', name: deploymentName },
      },
    ])
  }
}
