import { Injectable } from '@nestjs/common'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { RolloutStatus } from '#src/modules/runtime/runtime.enums.js'
import {
  type AppDeploySpec,
  type AppHealth,
  type AppRef,
  type DeployFailure,
  type RunLogs,
  type RunLogsOptions,
} from '#src/modules/runtime/runtime.types.js'
import type { Uuid } from '#src/utils/uuid.js'

// Remembers what was deployed so the release-list reconcile guard sees what a runtime would.
@Injectable()
export class MockAppRuntime extends AppRuntime {
  private readonly liveReleases = new Map<string, Uuid<'Release'>>()
  private readonly armedFailures = new Map<'deploy' | 'destroy', Error>()

  failNext(operation: 'deploy' | 'destroy', error: Error): void {
    this.armedFailures.set(operation, error)
  }

  setLiveRelease(slug: string, releaseUuid: Uuid<'Release'>): void {
    this.liveReleases.set(slug, releaseUuid)
  }

  deploy(ref: AppRef, spec: AppDeploySpec): Promise<void> {
    const failure = this.takeFailure('deploy')
    if (failure) {
      return Promise.reject(failure)
    }
    this.liveReleases.set(ref.app.slug, spec.releaseUuid)
    return Promise.resolve()
  }

  destroy(ref: AppRef): Promise<void> {
    const failure = this.takeFailure('destroy')
    if (failure) {
      return Promise.reject(failure)
    }
    this.liveReleases.delete(ref.app.slug)
    return Promise.resolve()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  readRolloutStatus(_app: AppRef): Promise<RolloutStatus> {
    return Promise.resolve(RolloutStatus.Complete)
  }

  readLiveReleaseUuid(ref: AppRef): Promise<Uuid<'Release'> | null> {
    return Promise.resolve(this.liveReleases.get(ref.app.slug) ?? null)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  readHealth(_app: AppRef): Promise<AppHealth> {
    return Promise.resolve({
      found: true,
      desiredReplicas: 1,
      availableReplicas: 1,
      updatedReplicas: 1,
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  readDeployFailure(_app: AppRef): Promise<DeployFailure | null> {
    return Promise.resolve(null)
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  readRunLogs(_app: AppRef, _options: RunLogsOptions): Promise<RunLogs | null> {
    return Promise.resolve({
      podName: 'mock-pod-abc123',
      logs: 'mock log line 1\nmock log line 2\n',
    })
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  private takeFailure(operation: 'deploy' | 'destroy'): Error | undefined {
    const failure = this.armedFailures.get(operation)
    this.armedFailures.delete(operation)
    return failure
  }
}
