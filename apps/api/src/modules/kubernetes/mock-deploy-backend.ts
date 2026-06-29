import { Injectable } from '@nestjs/common'

import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import type { RenderedManifests, RolloutPhase } from '#src/modules/kubernetes/deploy-backend.types.js'

/**
 * Network-free `DeployBackend` for test/local environments (mirrors the
 * `MockGithubClient` seam, AgDR-0014). Applies nothing and reports a healthy
 * rollout so e2e tests exercise the full deploy use-case with no cluster.
 * Override individual methods via `sinon.createStubInstance(MockDeployBackend)`.
 */
@Injectable()
export class MockDeployBackend extends DeployBackend {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  apply(_namespace: string, _manifests: RenderedManifests): Promise<void> {
    return Promise.resolve()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  rolloutStatus(_namespace: string, _deploymentName: string): Promise<RolloutPhase> {
    return Promise.resolve('available')
  }
}
