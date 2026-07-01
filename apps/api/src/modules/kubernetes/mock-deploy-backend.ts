import { Injectable } from '@nestjs/common'

import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import type { RenderedManifests } from '#src/modules/kubernetes/deploy-backend.types.js'

/**
 * Network-free `DeployBackend` for test/local environments (mirrors the
 * `MockGithubClient` seam, AgDR-0014). Applies nothing so e2e tests exercise
 * the full deploy use-case with no cluster. Override individual methods via
 * `sinon.createStubInstance(MockDeployBackend)`.
 */
@Injectable()
export class MockDeployBackend extends DeployBackend {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  apply(_namespace: string, _manifests: RenderedManifests): Promise<void> {
    return Promise.resolve()
  }
}
