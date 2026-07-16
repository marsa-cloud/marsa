import { Injectable } from '@nestjs/common'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import type {
  AppHealth,
  DeployFailure,
  RenderedManifests,
  RunLogs,
  RunLogsOptions,
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  readDeployFailure(_namespace: string, _deploymentName: string): Promise<DeployFailure | null> {
    return Promise.resolve(null)
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  readRunLogs(
    _namespace: string,
    _deploymentName: string,
    _options: RunLogsOptions,
  ): Promise<RunLogs | null> {
    return Promise.resolve({
      podName: 'mock-pod-abc123',
      logs: 'mock log line 1\nmock log line 2\n',
    })
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}
