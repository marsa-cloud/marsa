import { Injectable } from '@nestjs/common'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import {
  type BuildLogsOptions,
  type BuildObservation,
  type BuildRef,
  type BuildSpec,
  BuildState,
} from '#src/modules/runtime/runtime.types.js'

@Injectable()
export class MockBuildRuntime extends BuildRuntime {
  readonly started = new Map<string, BuildSpec>()
  readonly cancelled: string[] = []
  private readonly observations = new Map<string, BuildObservation>()
  private armedStartFailure: Error | null = null

  observe(buildUuid: string, observation: BuildObservation): void {
    this.observations.set(buildUuid, observation)
  }

  failNextStart(error: Error): void {
    this.armedStartFailure = error
  }

  start(build: BuildRef, spec: BuildSpec): Promise<void> {
    const failure = this.armedStartFailure
    this.armedStartFailure = null
    if (failure) {
      return Promise.reject(failure)
    }
    this.started.set(build.build.uuid, spec)
    return Promise.resolve()
  }

  cancel(build: BuildRef): Promise<void> {
    this.cancelled.push(build.build.uuid)
    return Promise.resolve()
  }

  readStatus(build: BuildRef): Promise<BuildObservation> {
    const queued = this.observations.get(build.build.uuid)
    if (queued) {
      return Promise.resolve(queued)
    }
    const state = this.started.has(build.build.uuid) ? BuildState.Succeeded : BuildState.NotFound
    return Promise.resolve({ state })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  readLogs(build: BuildRef, _options: BuildLogsOptions): Promise<string | null> {
    return Promise.resolve(
      this.started.has(build.build.uuid) ? `mock build log for ${build.build.uuid}` : null,
    )
  }
}
